# Step 6.1 evidence: six-digit ID numbers

- Decision: ADR-008 in `docs/DECISIONS.md` (owner decision 2026-11-06, request file `docs/requests/2026-11-06-presence-and-assignment-reports.md`, question 6). Plan approved by the owner on 2026-11-07.
- Branch and pull request: `phase-6-1-account-ids`; the pull request is linked from the branch.
- Built on `main` after Phase 6 was merged and tagged (`phase-6-done`).
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-07

## 1. What was built

| Item | Where |
|---|---|
| Every account (administrator, lecturer, learner) has a unique ID number from 100000 to 999999, assigned by the database | migration `20261107000300_account_id_numbers.sql`: `profiles.id_number` (not null, unique, six digits); a BEFORE INSERT trigger takes the next value of `private.id_number_seq` through `private.id_number_for()`, a fixed one-to-one shuffle; existing accounts numbered in joining order without touching `updated_at` |
| It never changes and is never reused | a BEFORE UPDATE trigger refuses any change for every role, the server included; clients have no update right on the column; accounts are never deleted |
| Who sees it | the person and administrators (existing profile rules); the lecturers of a learner's courses through `course_roster`, which now returns `id_number` (still never email or phone); learners never see other people's numbers |
| The person's profile | "ID number" card with Copy (confirmation in place; a clear message where the browser cannot copy) |
| Administrators | an ID number column in the Users list (a detail line on phone cards), in the user panel, and search by ID number in the Users list and the Enrol learners picker |
| Lecturers | an ID number column on the course's Learners tab |
| CSV import | each new or enrolled learner's number in the results and in the downloadable report (`id_number` column) |

## 2. Design rationale

- **Numbers that never repeat and reveal nothing.** A plain counter would show how many people have joined and in what order. Passing the counter through multiplication by 556231 (which shares no factor with 900000) and wrapping gives every account a different number with neighbours far apart, needs no retries, and can never collide. It stops at 900,000 accounts rather than repeat.
- **Owned by the database.** All account creation paths (sign-up, CSV import, provisioning a lecturer, inviting an administrator) create the profile through the sign-up trigger, so the number is set in one place and the browser never supplies it.
- **Privacy.** Lecturers need learners' numbers for teaching and, in Phase 10, the "Student ID" column of reports, so the roster function carries the number but still not email or phone. Learners see only their own.
- **Plain digits.** Shown as typed (for example 482913) with tabular figures, so it copies and searches exactly; searching accepts spaces.

## 3. Results

Local results (Windows, local Supabase), 2026-11-07:

| Suite | Result |
|---|---|
| Lint and type check | pass |
| Unit and component (Vitest) | 24 files, 327 tests, pass (new: 8 in `id-number.test.jsx`; the CSV report test in `admin-logic.test.js` now expects the `id_number` column) |
| Database (pgTAP) | 13 files, 601 tests, pass (new: 28 in `12_account_id_numbers.test.sql`) |
| Edge Function integration | 4 files, 59 tests, pass (the CSV import test now checks the returned ID number against the profile) |
| End-to-end (`tests/e2e/account-ids.spec.js`) | passes locally on desktop Chrome, desktop Firefox (dark), Pixel 7 and iPhone SE (dark) |
| Full end-to-end matrix and Lighthouse | CI on the pull request |

The database tests were written first and seen failing (the column did not exist), then the migration made all 28 pass, including a check that the shuffle gives 900,000 different numbers covering exactly 100000 to 999999.

Also fixed: test 11 (Phase 6) counted cover removals across the whole audit log and failed on a local database that end-to-end runs had used; it now counts only its own courses.

Local function runs sometimes lost one test (a different one each time) to the local functions runtime's cold start or memory limit; with the runtime restarted and warmed, all 59 passed in one run.

## 4. Checks for this step

| Check | Result | Proof |
|---|---|---|
| Every new account of every role gets a valid, unique six-digit number; existing accounts too | PASS | `12_account_id_numbers.test.sql` (administrator, lecturers and learners; no account without one; none shared) |
| Numbers never repeat and do not show the joining order | PASS | `12` (900,000 different numbers from 100000 to 999999; consecutive accounts far apart; refuses beyond 900,000) |
| Nobody can change a number | PASS | `12` (the database owner, the service role, the person, and an administrator are all refused; other profile edits still work) |
| Only the person, administrators and the learner's lecturers see it | PASS | `12` (another learner sees nothing; the course's lecturer sees it through the roster but not the profile; another lecturer is refused; visitors see nothing) |
| Shown on the profile with Copy; administrators find a person by it; lecturers see it on the Learners tab | PASS | `id-number.test.jsx`; `account-ids.spec.js` |
| The CSV import reports each new learner's number | PASS | `admin.test.js` (function); `id-number.test.jsx` (report) |
| Screens at 375, 768 and 1280 px in light and dark: no sideways scrolling, no text running out of a button, no console errors | PASS | section 6 (18 captures, checked automatically) |

## 5. Deployment

Staging needs, before or when this merges (the owner runs these, as before):

```
npx supabase db push --linked
npx supabase functions deploy bulk-import-learners
```

## 6. Screenshots

`docs/acceptance/phase-06-1/screens/`, at 375, 768 and 1280 px in light and dark: `learner-profile-id` (the ID number card with Copy), `admin-users-search-id` (the Users list searched by ID number, with the ID column), `admin-user-panel-id` (the user panel), `lecturer-learners-id` (the course's Learners tab). In full-page phone captures the navigation bar is drawn once over the page; on a real screen it stays at the bottom.

## 7. Known issues

| Item | Reason | Owner |
|---|---|---|
| Local function and end-to-end runs on the owner's Windows machine can lose a test to the local functions runtime's cold start or memory limit | Local environment; CI is the reference | Prince Boateng |
