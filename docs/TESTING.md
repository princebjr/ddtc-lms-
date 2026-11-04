# DDTC LMS: Testing and phase gates

Nothing moves to the next phase until it has been tested here. This file says what to test, how, and what counts as proof.

## 1. Test layers

| Layer | Tool | What it proves | Runs |
|---|---|---|---|
| Static | ESLint, `tsc --checkJs`, secret scan, dependency audit | No type errors, no hard-coded design values, no service-role key in the frontend, no known vulnerable packages | Every commit |
| Unit | Vitest | Pure logic: avatar initials, grade calculation helpers, validators (Zod), token contrast ratios, timing rules (skeleton, toast) | Every commit |
| Component | React Testing Library | Each shared component: states, keyboard, aria, responsive variants | Every commit |
| Database | pgTAP on local Supabase | RLS, constraints, triggers, helper functions, `calculate_course_grades`, audit and history immutability | Every commit |
| Storage and functions | pgTAP plus function integration tests | Storage policies; Edge Functions re-check role, ownership and rules; upload pipeline; retention rules | Every commit |
| End to end | Playwright | Real flows in a browser on every device project, light and dark | Every pull request |
| Accessibility | axe inside Playwright, manual screen-reader pass | WCAG 2.1 AA, both themes | Pull request; manual in Phase 13 |
| Performance | Lighthouse CI (mobile preset) | Budgets in `docs/RESPONSIVE.md` | Pull request for key pages |
| Real devices | Manual | Audio, recording, downloads, Google sign-in, keyboard and safe areas on real hardware | Phases 3, 6, 8 and 13, and acceptance |

## 2. The role matrix for database and storage tests

For every table, bucket and function, test each of these actors for each operation (select, insert, update, delete, call). Write the expected result before the policy.

| Actor | Notes |
|---|---|
| anonymous | No session |
| learner enrolled ACTIVE | Own rows only |
| learner enrolled COMPLETED | Read-only |
| learner not enrolled, WITHDRAWN, SUSPENDED enrolment | No access |
| another learner | Never sees the first learner's rows |
| suspended or deactivated user | Everything denied |
| lecturer OWNER of the course | Full course rights |
| lecturer CO_LECTURER | All but archive and lecturer management |
| lecturer of another course | No access |
| lecturer without `can_create_courses` | Cannot create courses |
| administrator with AAL1 session | Privileged operations denied |
| administrator with AAL2 session | Allowed as specified |
| Google-signed-in learner | Same as learner; never ADMIN or LECTURER |

Also test: draft and unpublished content invisible to learners; unreleased grades invisible; PENDING, REJECTED, DELETED files unreadable; archived course read-only for learners.

## 3. End-to-end device projects

Desktop Chrome, Firefox and WebKit (1280 by 720); laptop 1440 by 900; Full HD 1920 by 1080; iPhone SE (375 by 667); iPhone 15 (393 by 852); small Android (360 by 640); Pixel 7 (412 by 915); iPad gen 7 (810 by 1080, portrait and landscape); minimum width (320 by 568). Every flow runs in light and dark. Each screen has: no horizontal overflow at 320, 375, 768, 1024, 1280, 1920; touch targets at least 44 px on phones; skeleton then content with layout shift 0.1 or less; its toasts and floating button as listed in `docs/UI_FEEDBACK.md`.

## 4. Fixtures and data

Seed data (development and staging only, never real learner data): two administrators, three lecturers (one without course permission), twelve learners (states: active, completed, withdrawn, suspended), four courses (draft, pending, published, archived), lessons with audio, assignments of every instruction type, submissions in every state, graded and ungraded work, missing work, extensions, and grade fixtures with known marks that cover every D13 rule (early graded, missing-as-zero on and off, unpublished with released grades, late submission lifting a zero, empty categories, rounding, band boundaries 49.9, 50, 89.9, 100). Test accounts use clearly fake emails.

## 5. What a phase must show before it can be signed off

1. `npm run verify` is green locally and in CI, with the output summary saved.
2. Every item under the phase file's **Tests required** exists as an automated test, or (for real-device items) as a recorded manual check with device, OS and browser.
3. Every **Exit gate** line is ticked with proof (test name, screenshot or log).
4. All earlier phases' suites still pass (no regression).
5. No `console.error`, no skipped or `.only` tests, no new lint or type exceptions without a written reason.
6. Screenshots for each new or changed screen at 375, 768 and 1280 px in light and dark.
7. Security checks for the phase: RLS matrix complete for new tables; no new route or function without an authorisation check; secret scan clean.
8. A short list of known issues, each with a decision (fix now, defer with owner, or accept).
9. The owner's written approval on the pull request.

## 6. Test focus by phase

| Phase | Must be proven |
|---|---|
| 0 | CI fails on a fake service-role string, a lint error and a failing test; branch protection blocks merge |
| 1 | Avatar rules; tokens pass contrast; FAB, toast, skeleton behaviour; overflow and touch-target tests; theme switching with no flash |
| 2 | RLS matrix for `profiles`, settings, audit, notification preferences; trigger forces LEARNER; role and status columns cannot be changed by users; AAL1 denied for ADMIN |
| 3 | Email sign-up, verification, sign-in, reset, wrong-password messages that do not reveal accounts, suspended refusal, MFA for ADMIN; Google: new learner, existing learner link, ADMIN or LECTURER email refused, missing name flow, cancelled prompt, in-app browser notice; brand block placement; no flash of protected content |
| 4 | No path to change a role; every admin action audited; image validation; CSV import preview and errors |
| 5 | Cross-lecturer isolation; approval lifecycle; enrolment states; duplicates rejected; archive read-only |
| 6 | Storage denials; pipeline states; audio history; playback, download and lock-screen on real iPhone and Android |
| 7 | CHECK constraints for instruction types; category weights total 100; snapshot warnings |
| 8 | Signature, size and duration rejections; late and extension rules; resubmission; recorder on real devices; upload resume |
| 9 | Release gating; immutable grade history; non-submitters in results; counts add up |
| 10 | Exact numbers for every D13 case; chart counts equal authorised data; learner cannot export or query others |
| 11 | Notification recipients, retries (1, 5, 15, 60, 240 min), deduplication, reminder replacement |
| 12 | Retention never touches non-eligible files; dry run changes nothing; failures retried |
| 13 | Policy review; axe clean in both themes; Lighthouse budgets; VoiceOver and TalkBack; restore drill |
| 14 | Full acceptance journey on staging then production; rollback test |

## 7. Rules for tests

- Tests are deterministic: fixed seed data, fixed clock where time matters, no dependence on test order.
- A flaky test is a bug: fix or quarantine it with a written reason and an owner; never ignore it silently.
- Never weaken an assertion to pass. If a requirement changed, update the decision first (ADR), then the test.
- Test failures are reported with the failing output, not summarised away.
