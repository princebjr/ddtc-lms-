# Phase 3: Authentication

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Email and Google sign-in, MFA, suspended and unverified accounts, no flash of protected content, brand block placement in light and dark.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Pages and routes: `/` (to Sign In when signed out), `/login`, `/signup`, `/forgot-password`, `/reset-password`, email verification screen, loading and error states.
- Brand block directly below the Sign In and Sign Up forms (including the Google button): the gölarae logo, then directly beneath it the exact text "from gölarae", centred, nothing between them. The DDTC LMS logo sits above the form. Assets and rules are in D39.
- Supabase email-and-password and Google providers configured per environment. Sign In and Sign Up show Continue with Google per D27 (official button, "or" divider, full width), a Complete your profile screen for missing names, and refusal for ADMIN and LECTURER accounts. Before coding, Claude Code states the Supabase mechanism for D27 rules (4) and (5) and verifies which D32 session limits the plan enforces, and gets approval.
- Role-aware route guards and redirects to `/admin/dashboard`, `/lecturer/dashboard`, `/learner/dashboard`; signed-in users leaving auth pages are redirected.
- Suspended, deactivated and unverified handling; Turnstile CAPTCHA; Resend SMTP with branded templates.
- Admin MFA enrolment and enforcement.
- Authentication Loading State: a skeleton while the session is checked, with no flash of Sign In for a signed-in user and no flash of protected content for a signed-out user.
- Auth screens follow Section 15: single column on phones, correct `type`, `inputmode` and `autocomplete` values (including `current-password`, `new-password` and `one-time-code`), 16 px inputs so iOS does not zoom, the on-screen keyboard never hides the focused field or the submit button.

**Tests required**

- Playwright: register, verify, sign in, sign out, wrong password, reset password, suspended user refused, each role lands on the correct dashboard, signed-out visit to every protected route redirects to Sign In.
- Sign-up requires both names; a sign-up with a role in the request is still LEARNER; an unverified account cannot sign in until the email is verified; duplicate email and wrong-password messages do not reveal whether an address is registered; a self-registered user can never become ADMIN or LECTURER.
- Google (staging Google test accounts, plus a manual run on iOS 18 Safari): a new Google user becomes LEARNER; names are copied; a missing name forces Complete your profile; a Google sign-in with an ADMIN or LECTURER email is refused and links nothing; a verified-email match links to the existing LEARNER; an unverified match is refused; cancelling the Google prompt returns to Sign In with a clear message; inside an in-app browser the Open in Safari or Chrome notice appears instead of a failing Google screen.
- Auth screens render without overflow and with the brand line visible at 320, 375, 768 and 1280 px, in portrait and landscape, on iOS 18 Safari and Android Chrome.
- Visual check that the gölarae logo and the text "from gölarae" sit directly under both forms, logo above text, with nothing between, in light and dark.

**Exit gate (all must pass)**

- No protected data or route is reachable while signed out.
- Admin cannot reach the dashboard without MFA.
- Email sign-up, email verification, email sign-in and Continue with Google all work on staging on iOS 18 Safari, Android Chrome and desktop.

Git tag on completion: `phase-3-done`

## Evidence to save in `docs/acceptance/phase-03.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
