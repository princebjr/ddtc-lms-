# DDTC LMS: Capacity and speed

Started in Phase 13 (ADR-023); Phase 15 extends it with stress, spike and soak tests on staging (`docs/requests/2026-11-12-phase-15-stability-and-speed.md`).

## Tools (`tests/load/`, local or a throwaway copy only, never production)

| Tool | What it does | Run |
|---|---|---|
| `seed.sql` | Realistic sizes, a little above today's: 20 courses, each with one lecturer and 150 learners (3,000 learners), 12 lessons and 15 assignments per course, every learner's answer (45,000 answers, about 80% graded and released), one examination with 150 attempts. Sign-in works for `load-lecturer-1..20@ddtc.test` and `load-learner-1..300@ddtc.test` (password `Load-Password-2026`). | `docker exec -i supabase_db_ddtc-lms psql -U postgres -v ON_ERROR_STOP=1 < tests/load/seed.sql` |
| `timings.mjs` | Each read function the screens use, run as the user who would call it, timed by the database (EXPLAIN ANALYZE, median and slowest of three). | `node tests/load/timings.mjs [--json out.json] [--plan name]` |
| `policy-timings.mjs` | Plain table reads through row-level security as a learner and a lecturer. A per-row check shows here as seconds on a big table. | `node tests/load/policy-timings.mjs [--json out.json]` |
| `load.mjs` | Virtual learners and lecturers sign in and repeat what their screens ask for, with think time; reports count, errors, p50, p95, p99 per request and requests per second. | `node tests/load/load.mjs --learners 150 --lecturers 10 --seconds 120` |
| `tests/e2e/performance.spec.js` | Throttled mid-range phone (Pixel 7 profile, CPU 4x slower, slow 4G): load time (LCP), layout shift (CLS) and blocking time (TBT) on four pages. CLS is enforced; LCP and TBT are enforced with `ENFORCE_BUDGETS=1`. | `npx playwright test performance --project pixel-7-light` |

Reset the local database afterwards (`npx supabase db reset`): the seed adds thousands of accounts.

## Results

Measured on the developer's laptop (Docker limited to 2.8 GB), so absolute times are pessimistic and noisy; what matters is the before and after on the same machine. Staging figures come in Phase 15.

See `docs/acceptance/phase-13.md` section 4 for the figures of the Phase 13 readiness run.

## Rules learned

- A policy must never call a function per row on a large table. Compute the set once (`col in (select private.set_fn())`) or wrap a row-independent check as `(select private.fn(x))`. A SECURITY DEFINER function is never inlined by the planner.
- Join to a table instead of calling a function per row in a read function (migration 50).
- Every new policy or read function on a large table gets a line in `policy-timings.mjs` or `timings.mjs`.

## Growth plan (Phase 15, ADR-028)

DDTC runs on the Supabase free plan (no paid services). Each row is a step DDTC may need as it grows: the sign that it is needed, the action, the cost, and who decides. Plan prices are approximate (late 2026) and must be checked on Supabase's pricing page before deciding. The System health card and the monthly usage check (runbook "Plan limits") show the first three signs.

| Sign (trigger) | Action | Cost | Decides |
|---|---|---|---|
| File storage over 80% of 1 GB (System health warning) | Switch on learner-audio retention after review; ask lecturers for MP3/M4A at about 64 kbit/s mono; then Supabase Pro (100 GB) | Free, then about US$25 a month | Owner |
| Downloads over 4 GB in a month (Supabase usage page) | Same audio advice; then Pro (250 GB of downloads) | Free, then about US$25 a month | Owner |
| Database over 400 MB (System health warning at 80% of 500 MB) | Check what grew (audit logs, notifications; the 2-year cleanup runs daily); then Pro (8 GB) | Free, then about US$25 a month | Owner |
| More than about 150 people online at once (the free plan's Realtime limit is 200 connections; "Who's online" uses one per open app) | Pro (500 connections), or turn presence off for some screens | About US$25 a month | Owner |
| Screens slow for everyone at peak (p95 of the page reads over 1 s, database CPU high on the Supabase dashboard) | Pause exports and reports (Settings, Heavy features); then a larger database computer on Pro | Free; then about US$15–60 a month more | Owner |
| Learners far from Europe complain of slow audio | Supabase Smart CDN for Storage (Pro) | Included in Pro | Owner |
| Most uploads are large WAV files despite the guidance | A transcoding worker (an ADR first: cost and complexity) | A paid worker, about US$5–20 a month | Owner |
| The administrators' all-courses grade report over 4 s (about 185 ms per course; DDTC has about 20 courses, so about 40 times today's number) | Precompute the report nightly, or calculate several courses in one pass (an ADR first: grades are only calculated by `calculate_course_grades`) | Free (development) | Owner, with an ADR |
