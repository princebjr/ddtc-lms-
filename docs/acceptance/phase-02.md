# Phase 2 acceptance evidence: Database foundation and security core

- Phase file: `docs/phases/phase-02-database-security-core.md`
- Branch and pull request: `phase-2-database-security`, PR_LINK
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-05
- Plan approved by the owner on 2026-11-05 with the recommended option: `is_lecturer_of` and `is_enrolled` are built in Phase 5 with their tables (section 7).

## 1. What was built

| Build item (phase file) | Where |
|---|---|
| Enums `user_role`, `account_status`, `file_status`; removal of Supabase's default grants (no default access); `private` helper schema; shared `set_updated_at` and `prevent_change` triggers | `supabase/migrations/20261105000100_enums_and_helpers.sql` |
| `profiles` with constraints (names up to 100, contact format, unique lower(email), course creation for lecturers only), `ON DELETE RESTRICT` to `auth.users`; helpers `is_active_user`, `is_admin` (ADMIN, ACTIVE and AAL2), `is_active_lecturer`; column protection by column grants plus the `profiles_guard` trigger | `20261105000200_profiles.sql` |
| Append-only `audit_logs` (UPDATE, DELETE, TRUNCATE blocked for every role, the owner included); `write_audit` writer; audit triggers for role, status and course-creation changes | `20261105000300_audit_logs.sql` |
| `notification_preferences` (own row, email on by default) | `20261105000400_notification_preferences.sql` |
| Sign-up trigger on `auth.users`: always LEARNER and ACTIVE; email sign-up rejected without both names; Google uses given and family name and sets `profile_completed` false when one is missing; email changes mirrored | `20261105000500_signup_trigger.sql` |
| `system_settings` seeded with all 15 defaults (D04, D10, D14, D15, D17, D18, D19, D20, D24, D31, D32), JSON type kept, editor recorded, every change audited, sensitive rows hidden from lecturers | `20261105000600_system_settings.sql` |
| `file_objects` registry schema (D18, D33): server-only writes, status facts enforced by CHECK constraints; `profiles.profile_image_file_id` foreign key | `20261105000700_file_objects.sql` |
| Unique constraints, foreign keys, indexes, timestamp triggers, immutable history pattern, audit strategy | the migrations above; `docs/ARCHITECTURE.md` section 11 "Database security as built" |
| Seed: one administrator, two lecturers, three learners | `supabase/seed.sql` (local and CI only) |
| Generated database types (D23) for the typed client, with a CI drift check | `src/lib/database.types.d.ts`, `npm run db:types`, `.github/workflows/ci.yml` |

## 2. `npm run verify`

Local run on 2026-11-05 (Windows 11):

| Step | Result | Output |
|---|---|---|
| Lint | PASS | no findings |
| Type check | PASS | no errors (the client is now typed with `Database`) |
| Unit and component tests (Phase 1 regression) | PASS | 11 files, 198 tests |
| Secret scan | PASS | 171 files, 0 findings |
| Dependency audit (high and above) | PASS | 0 high or critical (K1 unchanged) |
| Build | PASS | built in 4.1 s |
| Database tests (pgTAP) | PASS | 4 files, 133 tests: `00_rls_guard` 3, `01_schema` 30, `02_signup` 20, `03_access_matrix` 80 |
| End-to-end and Lighthouse (Phase 1 regression) | CI | CI_RESULTS |

Tests were written first and failed before the migrations existed (`01_schema`: tables, enums and helpers missing; `02_signup` and `03_access_matrix`: types missing). Two faults in the test code itself were fixed (an enum default compared as an expression; an expected count read from `auth.users` inside a client session, which correctly has no access). No database rule was relaxed.

**Mutation check.** To show the matrix catches a real hole, `UPDATE (role)` was granted to `authenticated` and the guard trigger dropped on the local database: 7 tests failed, including "learner: cannot change own role" and "admin AAL2: cannot change a role directly". After restoring, 133 of 133 passed.

**Through the real Auth API** (local GoTrue, not SQL): a sign-up sending `"role":"ADMIN"` produced a LEARNER; a sign-up without a second name was refused and left no auth user; the seeded `learner1@ddtc.test` signed in with a password.

## 3. Tests required (phase file)

| Test | Result | Proof (`supabase/tests/`) |
|---|---|---|
| A learner cannot change own role or status | PASS | `03_access_matrix`: "learner: cannot change own role", "cannot change own status", also course-creation, email and `profile_completed` |
| A learner cannot read other profiles | PASS | "learner: reads own profile only", "cannot read another profile", "an update to another profile changes nothing" |
| A learner cannot write or read audit logs | PASS | "learner: cannot read audit logs", "cannot write audit logs", "cannot call the audit writer" |
| Sign-up always yields LEARNER even if the client sends another role | PASS | `02_signup`: role ADMIN and LECTURER in metadata both give LEARNER; also checked through the Auth API |
| A sign-up with an empty first or second name is rejected | PASS | `02_signup`: empty first, empty second, whitespace-only, no names; "a rejected sign-up leaves no auth user behind" |
| A Google-style sign-up with no family name yields `profile_completed` = false | PASS | `02_signup`; `03_access_matrix` "profile_completed becomes true once both names exist" |
| Every ADMIN policy denies an AAL1 session | PASS | `03_access_matrix` admin AAL1 block: no other profiles, settings, audit logs, others' preferences or file metadata, and no setting change; suspended admin with AAL2 also denied |

Also covered: anonymous denied on every table; suspended learner cannot edit or read data; lecturer reads only non-sensitive settings and cannot change them; admin AAL2 reads everything but cannot change a role, status or file status directly; settings keep their JSON type and cannot be added or deleted by clients; profile image must be the user's own VALIDATED file; the audit log rejects UPDATE, DELETE and TRUNCATE from administrators, the service role and the owner. Standing guards: RLS on every table, every foreign key `ON DELETE RESTRICT`, `anon` has no table privileges, no client DELETE or TRUNCATE, every SECURITY DEFINER function has a fixed `search_path`.

## 4. Exit gate

| Line | Result | Proof |
|---|---|---|
| All pgTAP tests pass in CI | GATE_CI | CI job "Database tests (pgTAP on local Supabase)" |

## 5. Screenshots

None: Phase 2 changes no screen. The Phase 1 screens are re-tested by the end-to-end suite in CI.

## 6. Real-device notes

None required for Phase 2 (TESTING.md section 1).

## 7. Deviations from the documents (for the owner's review)

| Item | Document says | Built | Reason |
|---|---|---|---|
| `is_lecturer_of`, `is_enrolled` | Phase 2 builds them | Phase 5 | Owner decision 2026-11-05: their tables (`course_lecturers`, `course_enrollments`) arrive in Phase 5, so in Phase 2 they would be untestable stubs. Added to the Phase 5 build list. |
| Helper location | "helper functions" (no schema named) | `private` schema | Not exposed through the Data API, so they cannot be called as RPCs. |
| `audit_logs.updated_at` | DATA_MODEL: every table has `updated_at` | no `updated_at` | The table is append-only and rows never change; DATA_MODEL lists only `created_at` for it. |
| `notification_preferences` key | `user_id, email_enabled` | `id` primary key plus unique `user_id` | Follows the all-tables-have-`id` convention in DATA_MODEL section 5. |
| `system_settings` extra columns | key, value, updated_by, updated_at | adds `description`, `is_sensitive`, `created_at` | `is_sensitive` implements "lecturers read non-sensitive" (section 7). |

## 8. Known issues and deferred items

| ID | Issue | Decision | Owner |
|---|---|---|---|
| K1 | `npm audit` moderate advisories in dev-only tooling; none high or critical | Accept; recheck each phase | Prince Boateng |
| K12 | Supabase Auth reports a rejected sign-up (missing name) as a generic "Database error saving new user" (HTTP 500). | Phase 3: the Sign Up form validates both names with Zod before calling Auth and maps this error to a friendly message | Claude |
| K13 | Google's `given_name` and `family_name` claims are assumed in the user metadata; Supabase's exact Google claims are confirmed with a real Google sign-in in Phase 3. If a claim is absent the profile is safely marked incomplete. | Phase 3 | Claude |
| K14 | The seeded administrator has no TOTP factor, so AAL2-only data is unreachable from the app until Phase 3 adds MFA enrolment. | Phase 3 | Claude |
| K15 | Local auth currently returns a session on sign-up without email confirmation; email verification (D22) is configured in Phase 3. | Phase 3 | Claude |
