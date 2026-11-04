# CLAUDE.md: DDTC LMS

You are building the **DDTC Learning Management System** for Dynamic Discipleship Training Centre (one institution; Christian education, biblical studies and discipleship training). Three roles: Administrator, Lecturer, Learner. A course contains lessons (there are no modules and no academic terms). The product name is "DDTC LMS". Repository: `ddtc-lms`.

## 1. Read before any work

| Always | `CLAUDE.md` (this file), `docs/DECISIONS.md`, `docs/PHASES.md`, `docs/TESTING.md` |
|---|---|
| Database or security work | `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md` |
| Any screen | `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md`, and the prototype in `docs/prototype/` |
| Acceptance and release | `docs/ACCEPTANCE.md`, `docs/RUNBOOK.md`, `docs/INPUTS.md` |
| Current phase | `docs/phases/phase-NN-*.md` |

`docs/BUILD_PLAN.md` is the master specification. If any file disagrees with it, BUILD_PLAN.md wins: tell the owner about the conflict.

## 2. Stack

React, Vite, JavaScript (ES modules) with JSDoc types checked by `tsc --checkJs`, Zod validation on every input, Tailwind CSS, shadcn/ui, Lucide React, React Router, Supabase JavaScript client. Supabase: Auth (email and password; Continue with Google for learners), PostgreSQL with Row Level Security, Storage, Edge Functions (TypeScript), `pg_cron`. Tests: Vitest, React Testing Library, pgTAP, Playwright, Lighthouse CI. Hosting: Vercel. Email: Resend. CAPTCHA: Cloudflare Turnstile. Errors: Sentry. No Express, MongoDB or Firebase.

## 3. Rules you never break

**Security**
- The Supabase service-role key never appears in frontend code, in any `VITE_` variable, in logs or in the repository. Privileged work happens in Edge Functions only.
- Never trust the client for user ID, role, course ID, score, file path or permission. Re-check on the server and in RLS.
- Roles come only from the database. Public sign-up always creates a Learner. Administrators and lecturers use email and password; Google sign-in is refused for them and must never link to their accounts.
- Every table has RLS on, with no default access. Every new table, bucket or function gets allow and deny tests for every role first.
- Every uploaded file goes through `register-upload`, upload, `finalize-upload`. Only VALIDATED files can be played or downloaded.
- Educational records are never hard-deleted. Foreign keys use `ON DELETE RESTRICT`; archive and deactivate instead.
- Grades are computed only by `calculate_course_grades`. No stored aggregates and no formulas in frontend code.

**Product**
- The brand block sits directly below the Sign In and Sign Up forms: the gölarae logo, then directly beneath it the text `from gölarae`. Never write "powered by gölarae".
- Use "Lessons", "Courses" and "Assignments". Never "modules" or "terms".
- Only the toasts and floating action buttons listed in `docs/UI_FEEDBACK.md` exist.

**UI**
- Mobile-first. No horizontal page scroll from 320 to 1920 px. Targets at least 44 px, inputs at least 16 px.
- Use design tokens and shared components only: no hard-coded colours, sizes or radii. Light and dark themes both pass the contrast tests.
- Every page that loads data shows a skeleton that matches its layout.

## 4. The phase protocol (how you work)

Build one phase at a time. Full detail in `docs/PHASES.md`. In short:

1. Orient: read the phase file; confirm the previous phase is tagged and `npm run verify` is green on `main`.
2. Plan and **stop for approval**.
3. Write security tests first and watch them fail.
4. Build in small commits on branch `phase-N-short-name`; database changes only as numbered migrations.
5. After each step run `lint`, `typecheck`, `test`, `test:db`; fix before moving on.
6. Run `npm run verify` (every earlier phase included), plus `test:e2e` on all device projects in light and dark, and Lighthouse where required.
7. Do the manual and real-device checks honestly.
8. Save evidence in `docs/acceptance/phase-NN.md`.
9. Open one pull request with the gate checklist; wait for CI and the owner's approval.
10. After approval: merge, tag, tick the tracker, update architecture docs.
11. **Stop.** Do not start the next phase until told to.

**Never move to the next phase while any test, gate item or manual check is failing, skipped or unverified.** Never delete, skip or weaken a test to get green. Never claim something passed without running it and showing the output.

## 5. Commands (create in Phases 0 and 1)

| Command | Runs |
|---|---|
| `npm run lint` | ESLint, including the no-hard-coded-values rule |
| `npm run typecheck` | `tsc --noEmit --checkJs` |
| `npm run test` | Vitest and React Testing Library |
| `npm run test:db` | Local Supabase plus pgTAP (RLS and Storage policy tests) |
| `npm run test:e2e` | Playwright on every device project, light and dark, with axe |
| `npm run lighthouse` | Lighthouse CI on the mobile preset with the budgets |
| `npm run verify` | All of the above plus the secret scan and dependency audit |

## 6. Repository layout

```
ddtc-lms/
  CLAUDE.md
  docs/            (this documentation set, acceptance/ for evidence)
  assets/brand/    (logos, icons; copied into src/assets/brand/)
  src/             (components/ui, components/brand, pages, lib, styles/tokens.css)
  supabase/        (migrations, functions, tests, seed)
  tests/           (e2e, fixtures)
  .github/workflows/
```

## 7. Git conventions

Public repository `princebjr/ddtc-lms-` (ADR-001 in `docs/DECISIONS.md`: public so that branch protection is enforced on a free account; never commit secrets). Branches `phase-N-short-name`. Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). One pull request per phase with the gate checklist copied from the phase file. Protected `main`: pull request and green CI required. Tags: `phase-N-done`, final `v1.0.0`.

## 8. When to stop and ask

Stop and ask the owner when a requirement is missing or contradictory, a decision in `docs/DECISIONS.md` seems wrong, a test cannot pass without changing a rule, a paid service or account is needed, a legal or privacy question appears, or you are about to do anything destructive. Offer options with a recommendation.

## 9. Definition of done for any task

Code written; tests written and passing; `npm run verify` green; screens checked at 375, 768 and 1280 px in light and dark; no `console.error`; docs updated; evidence saved; owner approval received.
