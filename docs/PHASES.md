# DDTC LMS: How the phases work

Claude Code builds the system one phase at a time. A phase is finished only when its tests pass, its manual checks are done, its evidence is saved and the owner has signed it off. Nothing is "done" because it was written; it is done when it was run and shown to pass.

## The phase protocol (every phase, no exceptions)

1. **Orient.** Announce the phase. Read the files listed at the top of the phase file. Check that the previous phase's tag exists and `npm run verify` is green on `main`.
2. **Plan.** Write a short plan: migrations, files, policies, functions, screens, tests. Note anything unclear or missing from the decisions. **Stop and wait for the owner's approval.**
3. **Tests first for security.** For every new table, bucket or function, write the allow and deny tests for each role before the policy or function. Run them and see them fail.
4. **Build in small steps** on a branch named `phase-N-short-name`. One logical change per commit. Every database change is a numbered migration.
5. **Run the checks** after each step: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:db`. Fix failures before continuing.
6. **Run the full suite**: `npm run verify` (all earlier phases included). For UI work also run `npm run test:e2e` on every device project, in light and dark, and `npm run lighthouse` where the phase lists it.
7. **Manual checks.** Do the manual and real-device checks the phase lists. Never claim a manual check you did not do.
8. **Evidence.** Write `docs/acceptance/phase-NN.md` with the test output summary, the exit-gate checklist and screenshots.
9. **Pull request.** Open one pull request for the phase with the gate checklist. CI must be green. **The owner reviews and approves.**
10. **Tag and update.** After approval, merge, create the tag named in the phase file, tick the phase in the tracker below, and update `docs/ARCHITECTURE.md` and the diagrams if the structure changed.
11. **Stop.** Do not begin the next phase until the owner tells you to.

## Rules that protect quality

- Never skip, delete, loosen or `.only` a test to get green. If a test is wrong, say so and get approval to change it.
- If a bug from an earlier phase appears, fix it in a separate commit with a regression test before continuing.
- If a requirement is not in `docs/DECISIONS.md` or `docs/BUILD_PLAN.md`, stop and ask. Do not invent policy.
- Report honestly: what passed, what failed, what you did not test.

## Phase list and tracker

| Phase | What it delivers | File |
|---|---|---|
| 0 | Repository, environments and CI | `phases/phase-00-repo-environments-ci.md` |
| 1 | Frontend scaffold and design system | `phases/phase-01-frontend-scaffold-design-system.md` |
| 2 | Database foundation and security core | `phases/phase-02-database-security-core.md` |
| 3 | Authentication | `phases/phase-03-authentication.md` |
| 4 | Profiles, user management and avatars | `phases/phase-04-profiles-user-management.md` |
| 5 | Courses, lecturers and enrolment | `phases/phase-05-courses-lecturers-enrolment.md` |
| 6 | Lessons and lesson audio | `phases/phase-06-lessons-and-audio.md` |
| 7 | Assignments and instruction audio | `phases/phase-07-assignments.md` |
| 8 | Submissions and file validation | `phases/phase-08-submissions-file-validation.md` |
| 9 | Grading, feedback and history | `phases/phase-09-grading-feedback-history.md` |
| 10 | Gradebook, distribution charts and exports | `phases/phase-10-gradebook-charts-exports.md` |
| 10.1 | Examinations, practical marks and branch groups (owner requests of 2026-11-10, ADR-016) | `phases/phase-10-1-examinations-practicals-branches.md` |
| 11 | Notifications, reports, audit viewer and settings | `phases/phase-11-notifications-reports-settings.md` |
| 12 | Assignment-audio retention | `phases/phase-12-audio-retention.md` |
| 13 | Hardening, accessibility, performance and recovery | `phases/phase-13-hardening-accessibility-performance.md` |
| 14 | Staging acceptance and production release | `phases/phase-14-staging-acceptance-production.md` |

Tracker (tick after sign-off):

- [x] Phase 0: Repository, environments and CI (`phase-0-done`)
- [x] Phase 1: Frontend scaffold and design system (`phase-1-done`)
- [x] Phase 2: Database foundation and security core (`phase-2-done`)
- [x] Phase 3: Authentication (`phase-3-done`)
- [x] Phase 4: Profiles, user management and avatars (`phase-4-done`)
- [x] Phase 5: Courses, lecturers and enrolment (`phase-5-done`)
- [x] Phase 6: Lessons and lesson audio (`phase-6-done`)
- [x] Step 6.1: Six-digit ID numbers, ADR-008 (`phase-6-1-done`)
- [x] Phase 7: Assignments and instruction audio (`phase-7-done`)
- [x] Phase 8: Submissions and file validation (`phase-8-done`)
- [x] Phase 9: Grading, feedback and history (`phase-9-done`)
- [x] Step 9.1: To grade, Grades and feedback, and 16:9 course covers (`phase-9-1-done`)
- [x] Phase 10: Gradebook, distribution charts and exports (`phase-10-done`)
- [x] Phase 10.1: Examinations, practical marks and branch groups (`phase-10-1-done`)
- [x] Step 10.2: Letter grades only on the course grade (`phase-10-2-done`)
- [x] Step 10.3: Examination answers as uploaded audio, PDF or Word files (`phase-10-3-done`)
- [x] Phase 11: Notifications, reports, audit viewer and settings (`phase-11-done`)
- [x] Step 11.1: Live presence, "Who's online"; settings that take effect; examination documents and audio answers (`phase-11-1-done`)
- [x] Step 11.2: Examination types and one type per section (`phase-11-2-done`)
- [x] Phase 12: Assignment-audio retention (`phase-12-done`)
- [x] Phase 13: Hardening, accessibility, performance and recovery (`phase-13-done`); restore drill deferred to Phase 14 (ADR-025)
- [ ] Phase 15: Stability and speed, on staging (`phase-15-done`); runs **before** Phase 14 (owner, 2026-11-12, ADR-023). Brief: `docs/requests/2026-11-12-phase-15-stability-and-speed.md`
- [ ] Phase 14: Staging acceptance and production release (`v1.0.0`, the final tag)

### Owner requests waiting to be scheduled

- 2026-11-06: assignment performance reports (built in Phase 10, `export-gradebook`) and a live presence directory (planned for Phase 11). Open questions first: `docs/requests/2026-11-06-presence-and-assignment-reports.md`.
- 2026-11-10: end-of-course examinations (MCQ, short answer, essay; text and audio answers; no countdown timer; course grade weekly assignments 40%, Local Assembly practicals 30%, final examinations 30%), practical marks entered by the lecturer, and learners grouped by branch. Built in Phase 10.1 (ADR-016): `docs/requests/2026-11-10-examinations.md` and `docs/requests/2026-11-10-practical-marks-and-branch-groups.md`.
- 2026-11-10: on the learner's examination page, upload an audio file or a PDF or Word file as an answer as well as recording, and a red-bordered Record button. Built in Step 10.3 (ADR-018).
- 2026-11-11: administrators and lecturers send announcements to learners, in the app and by email. Built in Phase 11 (ADR-019): `docs/requests/2026-11-11-announcements.md`.
- 2026-11-11: settings that take effect, arrow bullets on the dashboard introduction, the signed-out alert card, examination documents that open, up to three audio answers, and smaller wording changes. Built in Step 11.1 (ADR-020 items 7 to 12): `docs/requests/2026-11-11-settings-take-effect-intro-arrows-signed-out-alert.md`.
- 2026-11-11: the lecturer chooses an examination's types of question, and each section has one type. Built in Step 11.2 (ADR-021): `docs/requests/2026-11-11-examination-types.md`.
- 2026-11-12: Phase 15, stability and speed (stress, spike and soak tests, capacity, speed on low-end phones). Runs after Phase 13 and before Phase 14, on staging (ADR-023). Five questions go to the owner before its plan: `docs/requests/2026-11-12-phase-15-stability-and-speed.md`.
- 2026-11-12: learners and lecturers clear notifications one at a time or all at once. Built in Phase 13 (ADR-024).

## Session prompt for each phase

> Read `CLAUDE.md`, `docs/BUILD_PLAN.md`, `docs/DECISIONS.md` and `docs/ARCHITECTURE.md`. We are starting Phase N. Write a plan listing the migrations, files, policies and tests you will create, and wait for my approval. Write the allow and deny tests for every role before the feature code. Do not begin Phase N+1. When finished, run the full test suite and show the exit-gate checklist with pass or fail for each item.
