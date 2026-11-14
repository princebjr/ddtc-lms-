# Phase 14 acceptance evidence: production release

Owner decision of 2026-11-14 (ADR-029): go straight to production without the pilot; use the app and debug what goes wrong afterwards. Production setup is in `docs/RUNBOOK.md` "Production".

## 1. What was done (2026-11-14)

| Step | Result |
|---|---|
| Free-plan slot | `ddtc-lms-dev` paused by the owner (development uses the local stack) |
| Project | `ddtc-lms-production` (`gajmtqnvfjyvrhzjjcum`, eu-west-1, free plan) |
| Database | All 60 migrations applied with `supabase db push`, no seed data |
| Storage | 6 buckets from the migrations, all private, with their policies |
| Auth | `[remotes.production]` pushed: site address https://ddtc-lms.vercel.app, 10-minute access tokens, rate limits as staging (150 sign-ins, 300 refreshes per 5 minutes per address), no CAPTCHA (D22), email confirmation off until the domain exists (ADR-029) |
| Edge Functions | All 24 deployed |
| Scheduled jobs | 7 running (`cleanup-files-hourly`, `notification-retention-daily`, `rate-limit-clean-daily`, `retention-runner-daily`, `schedule-reminders`, `send-notification-email`, `system-health-daily`); vault holds `project_url` and `service_role_key` |
| Settings | Retention off (`retention_enabled = false`); Help & Support contact set as data (never in the repository) |
| First administrator | Bootstrap run for the owner; bootstrap now disabled. Invitation sent |
| App | Vercel production built from `main` (103f44c, PR #29, CI green) with production's address and public key, Google hidden |
| Code | `VITE_GOOGLE_SIGN_IN` build switch (unit test `google-switch.test.jsx`) |

## 2. Checks on production

| Check | Result |
|---|---|
| Security headers on https://ddtc-lms.vercel.app (CSP, HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy) | **Pass**, all present; CSP `connect-src` allows only the app and `*.supabase.co` |
| Sign In and Sign Up at 375 px | **Pass:** headings "Welcome back" and "Create your account", brand line "from gölarae" under each form, no Continue with Google, no console errors |
| Rollback | **Pass:** `vercel rollback` to the previous deployment took 21 s with the database untouched; `vercel promote` restored the current one |
| Sign in as each role, acceptance journey on production | **Open:** waits for the owner's administrator account (invitation) and the first lecturer and learners |

## 3. Exit gate

| Item | Result |
|---|---|
| Written sign-off in `docs/DECISIONS.md` | **Open:** launch decision recorded (ADR-029); the owner's sign-off of v1.0.0 follows use of the app |
| Restore drill from a real nightly backup, before production opens | **Not done, by owner decision** (ADR-029): first week after launch |
| Real-device matrix with no open defects | **Open:** the owner uses the app on their own devices |
| Retention in dry-run for the first 30 days | **Pass:** retention is off |
| Production backups | **Open (owner):** the nightly backup still copies staging until the `BACKUP_*` secrets point at production (runbook "Production") |

`v1.0.0` is not tagged until the open items pass.

## 4. Owner steps

1. Open the invitation email, choose a password, sign in at https://ddtc-lms.vercel.app and set up two-step verification.
2. Users, Invite administrator: Solomon Nyamekye (the app needs two active administrators). Until the domain exists, his invitation email only arrives if he is a member of the Supabase organisation; otherwise create his account in the Supabase dashboard (Authentication, Users, Add user) and promote him from Users in the app.
3. Store the production database password in a password manager.
4. Buy the domain and send its name (runbook "The day the domain exists").
5. Point the backups at production (runbook "Backups for production").
6. Restore drill in the first week.
