# Phase 0: Repository, environments and CI

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** CI, branch protection and the secret scanner must demonstrably fail on bad input before anything else is built.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Create the Git repository, branch protection (pull request and passing CI required), `CLAUDE.md`, `docs/BUILD_PLAN.md` (this document), `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, and version-controlled Mermaid diagrams: system architecture, role/permission map, database ERD, and workflow diagrams.
- Copy the documentation set (`CLAUDE.md`, `docs/`), `assets/brand/` and the prototype into the repository, and add the npm scripts listed in `docs/TESTING.md` (`lint`, `typecheck`, `test`, `test:db`, `test:e2e`, `lighthouse`, `verify`).
- Create Supabase projects for development and staging; reserve production. Initialise the Supabase CLI and a `supabase/migrations` folder.
- GitHub Actions: install, lint, `checkJs`, Vitest, pgTAP against a local Supabase, build, secret scan.
- Create Vercel projects with preview deployments for pull requests.

**Tests required**

- CI passes on the empty project and fails when a fake service-role string is added under `src/`.

**Exit gate (all must pass)**

- Inputs needed by Phases 0 to 2 are supplied; every other Section 4 input has a named owner and a due date matching the phase that needs it.
- Architecture diagrams reviewed and consistent with this build plan.
- CI green; branch protection active.

Git tag on completion: `phase-0-done`

## Evidence to save in `docs/acceptance/phase-00.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshot of the passing CI run and of the failing run that proves the guards work.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
