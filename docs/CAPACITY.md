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
