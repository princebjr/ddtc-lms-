# Phase 0 acceptance evidence: Repository, environments and CI

- Phase file: `docs/phases/phase-00-repo-environments-ci.md`
- Branch and pull request: `phase-0-repo-ci`, https://github.com/princebjr/ddtc-lms-/pull/1
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-04

## 1. Environments created

| Item | State |
|---|---|
| GitHub repository | https://github.com/princebjr/ddtc-lms- (public, ADR-001) |
| Branch protection on `main` | Active: pull request required; required check `CI gate`; branch must be up to date; applies to administrators; force-push and deletion blocked; conversations must be resolved |
| Supabase development | `ddtc-lms-dev`, ref `jbuonluqyiutiybutrqm`, eu-west-1 (Ireland), ACTIVE_HEALTHY |
| Supabase staging | `ddtc-lms-staging`, ref `iybsnzrkkddkqnhfqykv`, eu-west-1 (Ireland), ACTIVE_HEALTHY |
| Supabase production | Reserved; created in Phase 14 on a paid plan (O17) |
| Supabase CLI | Initialised (`supabase/config.toml`, `migrations/`, `functions/`, `tests/`); used through `npx supabase` |
| Vercel | Project `ddtc-lms` connected to the repository; preview deployment on every pull request (check `Vercel` passes on PR #1) |
| CI | `.github/workflows/ci.yml`: static checks, gitleaks over full history, pgTAP on local Supabase, Playwright (24 projects), Lighthouse, single required `CI gate` |

## 2. CI results

| Run | Branch | Result | Link |
|---|---|---|---|
| Phase 0 (passing) | `phase-0-repo-ci` | All 6 jobs and `CI gate` pass; Vercel preview passes | https://github.com/princebjr/ddtc-lms-/actions/runs/41849999942 |
| Guard proof: fake service-role string under `src/` | `proof/service-role` (PR #2) | Fails at `npm run scan:secrets`: `src/leak-proof.js:2 [service-role-text-in-src]`; merge BLOCKED | https://github.com/princebjr/ddtc-lms-/actions/runs/41850552154 |
| Guard proof: lint error | `proof/lint-error` (PR #3) | Fails at `npm run lint`: `'unusedVariable' is assigned a value but never used`; merge BLOCKED | https://github.com/princebjr/ddtc-lms-/actions/runs/41850561371 |
| Guard proof: failing test | `proof/failing-test` (PR #4) | Fails at `npm run test`: `AssertionError: expected 2 to be 3`; merge BLOCKED | https://github.com/princebjr/ddtc-lms-/actions/runs/41850583249 |

Each proof branch is the passing Phase 0 branch plus one deliberate fault, so each fails only for its own reason. All three pull requests report merge state `BLOCKED`, which proves branch protection blocks a red pull request. They are closed without merging after sign-off.

The first CI run on PR #1 failed. Causes found and fixed in commits `437d0b1` and `b399e36`: missing browser globals for `page.evaluate` in the e2e lint config; `vite preview` bound to `localhost` (IPv6 on the runner) while Playwright waited on 127.0.0.1; a wrong JSDoc type in `playwright.config.js`; a gitleaks false positive on the secret-guard test fixture (fixture changed, the one historical fingerprint listed in `.gitleaksignore` with a reason); and an axe contrast failure in Firefox dark mode on the unstyled placeholder (fixed with paired system colours).

## 3. Local results

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 2 files, 20 tests |
| `npm run scan:secrets` | Pass: 67 files, 0 findings |
| `npm run audit:deps` | Pass (no high or critical); see known issue K1 |
| `npm run build` | Pass |
| `npm run test:db` | Pass: 1 file, 3 tests (`00_rls_guard.test.sql`) |
| `npm run test:e2e` | Verified in CI, local run deferred (K6): 24 of 24 projects pass, run https://github.com/princebjr/ddtc-lms-/actions/runs/41849999942 |
| `npm run lighthouse` | Verified in CI, local run deferred (K6): mobile preset within budgets, run https://github.com/princebjr/ddtc-lms-/actions/runs/41849999942 |
| `npm run verify` | Verified in CI, local run deferred (K6): every other component passes locally (rows above); e2e and Lighthouse pass in CI, run https://github.com/princebjr/ddtc-lms-/actions/runs/41849999942 |

## 4. Tests required (phase file and TESTING.md section 6)

| Test | Result | Proof |
|---|---|---|
| CI passes on the empty project | PASS | Run 41849999942 |
| CI fails when a fake service-role string is added under `src/` | PASS | PR #2, run 41850552154; also unit tests in `tests/unit/check-secrets.test.js` |
| CI fails on a lint error | PASS | PR #3, run 41850561371 |
| CI fails on a failing test | PASS | PR #4, run 41850583249 |
| Branch protection blocks merge | PASS | PRs #2 to #4 merge state `BLOCKED`; protection settings in section 1 |

## 5. Exit gate

| Line | Result | Proof |
|---|---|---|
| Inputs needed by Phases 0 to 2 are supplied; every other Section 4 input has a named owner and a due date matching the phase that needs it | PASS | `docs/INPUTS.md` (owner Prince Boateng for all; due phase per item; item 4 supplied); `docs/DECISIONS.md` O1 to O17 settled 2026-11-04 |
| Architecture diagrams reviewed and consistent with this build plan | PENDING owner review | `docs/architecture/` (8 Mermaid files) indexed in `docs/ARCHITECTURE.md` section 21 |
| CI green; branch protection active | PASS | Run 41849999942; section 1 |

## 6. Real-device notes

None required for Phase 0.

## 7. Known issues and deferred items

| ID | Issue | Decision | Owner |
|---|---|---|---|
| K1 | `npm audit` reports 13 moderate advisories in dev-only tooling (ESLint's `minimatch`, Lighthouse CI's `glob` and `rimraf`). No fix without breaking downgrades. High advisories in Lighthouse CI's `basic-ftp` were removed with an `overrides` pin to 6.2.5. Nothing ships to the browser. | Accept; recheck each phase | Prince Boateng |
| K2 | Supabase URL and anon key are not yet set in Vercel; the placeholder page does not use them. | Defer to Phase 1 (Supabase client) | Claude, approved by Prince Boateng |
| K3 | Repository name is `ddtc-lms-` (trailing dash) while the docs say `ddtc-lms`. Works as is. | Accept unless the owner renames it | Prince Boateng |
| K4 | `supabase start` prints "Skipping migration .gitkeep"; harmless until the first migration in Phase 2. | Accept; the file is removed when the first migration lands | Claude |
| K5 | `postgres-meta` (used only by Supabase Studio) is excluded from the local stack; it timed out on first start and is not needed for pgTAP. | Accept | Claude |
| K6 | The Playwright browser download stalls on the development machine (no bytes written after 10 minutes, twice), so `test:e2e`, `lighthouse` and the full `verify` were not run locally. All three pass in CI on the same commit. | Owner accepted the CI runs as proof for Phase 0 (2026-11-04). Retry the local install before Phase 1 sign-off, which needs real e2e runs | Prince Boateng |
