# Phase 3 acceptance evidence: Authentication

- Phase file: `docs/phases/phase-03-authentication.md`
- Branch and pull request: `phase-3-authentication`, https://github.com/princebjr/ddtc-lms-/pull/7
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-05
- Plan approved by the owner on 2026-11-05, including the two mechanisms the phase file asks to be stated before coding (section 7).

## 1. What was built

| Build item (phase file) | Where |
|---|---|
| Pages and routes: `/` (Sign In or dashboard), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/confirm`, `/auth/callback`, `/complete-profile`, `/mfa`; loading and error states | `src/router.jsx`, `src/pages/auth/`, `src/components/auth/` |
| Brand block directly below the Sign In and Sign Up forms (Google button included); DDTC logo above the form | `src/components/auth/AuthLayout.jsx`; screenshots below |
| Email and password, Continue with Google (official button, "or" divider), Complete your profile, refusal of Google for ADMIN and LECTURER | `src/components/auth/GoogleSection.jsx`, `src/pages/auth/google.js`, migration `20261105000800_auth_rules.sql` |
| Role-aware guards and redirects to `/admin/dashboard`, `/lecturer/dashboard`, `/learner/dashboard`; signed-in users leave auth pages | `src/lib/auth/access.js` (pure, unit-tested), `src/components/auth/Guards.jsx` |
| Suspended, deactivated and unverified handling | `LoginPage.jsx`, `access.js`, Auth config (`enable_confirmations`) |
| Admin MFA enrolment and enforcement | `src/pages/auth/MfaPage.jsx`; `is_admin()` requires AAL2 (Phase 2) |
| Authentication Loading State (no flash either way) | `AuthSkeleton`, `ShellSkeleton` in the guards |
| Section 15 inputs: `type`, `inputmode`, `autocomplete` (`username`, `current-password`, `new-password`, `one-time-code`), 16 px inputs, focused field kept above the keyboard | `src/components/auth/FormField.jsx` |
| D32 session limits: ADMIN on the server (12 h absolute, 30 min idle via `record_activity()`); LECTURER and LEARNER in the client, with the catalogue warning toast | migration 8, `src/components/auth/SessionWatcher.jsx`, `src/lib/auth/session-limits.js` |
| Staging: 8 migrations pushed; Auth config from `[remotes.staging]` in `supabase/config.toml` | `supabase db push --remote`, `supabase config push` (diff verified clean afterwards) |

## 2. `npm run verify`

CI on commit `bd52337` (PR #7, run 42021806094): all jobs green: static checks (lint, type check, unit and component tests, secret scan, audit, build), gitleaks over full history, pgTAP, Playwright on every device project in light and dark in 4 shards (auth suite against local Supabase in each shard), Lighthouse, CI gate.

| Suite | Count |
|---|---|
| Unit and component (Vitest) | 14 files, 247 tests |
| Database (pgTAP) | 5 files, 181 tests (24 new: Google guard, admin session limits) |
| End-to-end (Playwright) | full matrix green, including `auth.spec.js` (16 flows) on every project |
| Lighthouse (median of 3) | first route 187.5 KB of JavaScript (budget 200 KB), Performance 0.99, Accessibility 1 |

Faults found during the phase and fixed (no test or rule weakened): first-route JavaScript over budget (fixed with `zod/mini` and a client built from Supabase Auth and PostgREST only); desktop toasts covering the account menu; a deliberate sign-out keeping a "next" link; Vercel lacking a single-page-app rewrite (`vercel.json`); `/auth/confirm` racing the PKCE code exchange (reads the opening address, `initial-url.js`); auth waits allow 15 s because a local sign-in took 4 s under parallel load (45 ms alone).

## 3. Tests required (phase file)

| Test | Result | Proof |
|---|---|---|
| Playwright: register, verify, sign in, sign out, wrong password, reset password, suspended user refused, each role lands on the correct dashboard, signed-out visit to every protected route redirects to Sign In | PASS (CI, every device project) | `tests/e2e/auth.spec.js` |
| Sign-up requires both names; a role in the request is still LEARNER; unverified cannot sign in; duplicate-email and wrong-password messages do not reveal registration; a self-registered user can never become ADMIN or LECTURER | PASS | `auth.spec.js`, `tests/unit/auth-logic.test.js`, `supabase/tests/02_signup.test.sql`, `03_access_matrix.test.sql` |
| Google: new user LEARNER; names copied; missing name forces Complete your profile; ADMIN or LECTURER email refused and links nothing; verified match links; unverified match refused; cancelled prompt returns with a message; in-app browser shows the notice | PASS (rules in pgTAP and e2e; desktop on staging by the owner) | `04_auth_rules.test.sql` (refusals, linking, verified email), `auth.spec.js` (Complete your profile, cancelled and refused callbacks), `auth-pages.test.jsx` (in-app notice). Staging: the owner's Google sign-in linked to the existing verified learner (section 6) |
| Auth screens without overflow and with the brand line at 320, 375, 768 and 1280 px, portrait and landscape | PASS (emulated) | `routes.spec.js` and `width-sweep.spec.js` include the auth routes; real iOS 18 and Android: OPEN (section 6) |
| Brand block under both forms, logo above text, nothing between, light and dark | PASS | `auth.spec.js` (layout), `auth-pages.test.jsx` (DOM order and exact text), screenshots |

## 4. Exit gate

| Line | Result | Proof |
|---|---|---|
| No protected data or route is reachable while signed out | PASS | `auth.spec.js` (every protected route redirects; no flash of protected content); pgTAP anon denial; on staging every table and `record_activity` answer `42501` to an anonymous request |
| Admin cannot reach the dashboard without MFA | PASS | `auth.spec.js` (admin redirected to `/mfa` until a valid TOTP; challenged on the next sign-in) on every device project; pgTAP: every ADMIN policy denies AAL1 |
| Email sign-up, email verification, email sign-in and Continue with Google all work on staging on iOS 18 Safari, Android Chrome and desktop | **Desktop PASS; iOS 18 Safari and Android Chrome OPEN** | Section 6 |

## 5. Screenshots

`docs/acceptance/phase-03/screens/`: 36 images, the six signed-out auth screens (`login`, `signup`, `forgot-password`, `verify-email`, `reset-password`, `auth-confirm`) at 375, 768 and 1280 px in light and dark (`node scripts/capture-screenshots.mjs 03 ...`). MFA, Complete your profile and the role dashboards need a session; they are exercised by the end-to-end suite (the dashboards use the Phase 1 shells, screenshotted in Phase 1).

## 6. Staging and real-device notes

Staging: `ddtc-lms-staging` (`iybsnzrkkddkqnhfqykv`), app on the Vercel preview of this branch.

- 2026-11-05, desktop browser, by the owner: sign-up, email verification, sign-out, sign-in, wrong password and Continue with Google were reported working. The staging database afterwards (read-only query, no personal data): 2 accounts, both LEARNER, ACTIVE, email verified, profile complete; one has email and Google identities (Google linked to the existing verified learner, D27 rule 5); 2 `account.created` audit events.
- iOS 18 Safari and Android Chrome: **not yet run**.
- Admin MFA on staging: not run (no staff account exists on staging until Phase 4 provisioning); covered on every device project in CI.

## 7. Decisions and deviations (for the owner's review)

| Item | Document says | Built | Reason |
|---|---|---|---|
| D27 rules 4 and 5 mechanism | Phase 3 must state it | A trigger on `auth.identities` (insert and update) refuses Google for ADMIN and LECTURER, for an unverified Google email, and for linking to an unverified existing account; it runs inside GoTrue's transaction, so nothing is linked | Owner-approved 2026-11-05. Supabase links identities automatically and cannot be told not to |
| D32 limits mechanism | Phase 3 must verify and state it | ADMIN: `is_admin()` checks the session age and last activity; LECTURER and LEARNER: client timers | Owner-approved 2026-11-05. Supabase limits are paid-plan only and one value for every user |
| Password minimum (D22) | 10 characters | **8 characters, every account** | Owner change 2026-11-05; recorded in BUILD_PLAN, DECISIONS and SECURITY_AND_ACCESS |
| CAPTCHA (D22) | Turnstile on sign-up, sign-in and recovery | **Removed** | Owner change 2026-11-05 (it slowed sign-in). Supabase per-IP rate limits remain |
| Branded email templates | Resend SMTP with branded templates | Supabase default emails; branded templates kept in `supabase/templates`, off in config | The free plan refuses template changes without custom SMTP; SMTP needs a domain (INPUTS 1). `/auth/confirm` handles both link kinds |
| Supabase client | `createClient` | Auth and PostgREST clients wired the same way | 200 KB first-route budget; Storage is loaded with uploads (Phase 6) |
| Holding page | `/` placeholder | `/` goes to Sign In or the dashboard; the owner's tagline (Revelation 2:10b) moved to the auth hero | Sign In replaces the placeholder |

## 8. Known issues and deferred items

| ID | Issue | Decision | Owner |
|---|---|---|---|
| K1 | `npm audit` moderate advisories in dev-only tooling | Accept; recheck each phase | Prince Boateng |
| K15 | No domain: staging runs on Vercel preview addresses behind Vercel Authentication; each new branch has a new address (Supabase allows all project previews by pattern) | A stable staging address (domain or Vercel alias) before Phase 14 | Prince Boateng |
| K16 | Branded emails need custom SMTP; Supabase's built-in mailer only delivers to members of the Supabase team | Resend once DDTC has a domain (INPUTS 1) | Prince Boateng |
| K17 | Google OAuth consent screen is in Testing mode (test users only) | "In production" before launch (D27 item 7); needs public privacy and terms pages (INPUTS 5) | Prince Boateng |
| K18 | With default emails, a link opened on another device verifies the account but asks the user to sign in there once; a recovery link works only in the browser that asked | Lifted when branded templates (token hash) are switched on with SMTP | Claude |
| K19 | iOS 18 Safari and Android Chrome staging run outstanding | Required before `phase-3-done` | Prince Boateng |
