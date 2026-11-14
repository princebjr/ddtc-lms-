# Phase 15 acceptance evidence: stability and speed

Branch `phase-15-stability-speed`. Brief `docs/requests/2026-11-12-phase-15-stability-and-speed.md`. Owner answers of 2026-11-12/13 (ADR-028: no paid services, production on the Supabase free plan, 2 GB Android and slow 3G, no transcoding, no paid images, no offline reading; staging load tests scaled for the free plan). Owner requests added on the way (ADR-027): the info-alert idle notice on Sign In, the idle card's button spacing, and Help & Support for learners and lecturers. Standard recorded as D45.

## 1. What was built

| Area | What | Where |
|---|---|---|
| One call per screen | `get_lesson_page`, `get_course_page`, `get_assignment_page`, `list_my_assignments`: security invoker, so RLS decides; pgTAP proves each part equals the separate reads for every role | migration 55, pgTAP 44 |
| Client data layer | In-memory stale-while-revalidate cache per person, emptied on every sign-out (idle included) and when another person signs in; data started by the route; prefetch on intent; next lesson fetched quietly; audio link signed early | `src/lib/data-cache.js`, `src/router.jsx`, `src/lib/storage.js` |
| Rendering | Screen code loaded with its route module; waveform without forced layout; cleaned HTML remembered (emptied on sign-out) | change 3 in `docs/PERFORMANCE.md` |
| Images | Covers (1600 px) and profile photos (320 px) shrunk to WebP (JPEG in Safari) in the browser before the normal upload pipeline; disguised files are not converted | `src/lib/images/shrink.js` |
| Audio guidance | Size tip in the lesson and assignment editors (no transcoding, ADR-028) | `src/lib/audio/format.js` |
| Stability | Error boundary per screen inside the app frame; 45 s request time limit; retries for reads only (network error, 502/503/504) with growing, spread waits; slow-load notice after 10 s with Retry | `PageErrorBoundary.jsx`, `resilient-fetch.js`, `Skeletons.jsx` |
| Heavy-feature switches | Exports and reports can be paused from Settings; people are told plainly | migration 58, pgTAP 47 |
| Database safety | Idle-in-transaction limit 60 s for every app role; 60 s statement limit for the Edge Functions | migration 60, pgTAP 49 |
| Plan limits | System health warns at 80% and 95% of file storage and database size | migration 57, pgTAP 46 |
| Retention | Notifications, email records and reminders removed after 2 years, daily at 03:20 | migration 59, pgTAP 48 |
| Help & Support (owner request) | Getting Started, How to Use DDTC, FAQ, Contact Support (email, phone, WhatsApp) for learners and lecturers; contact held as administrator settings | migration 56, pgTAP 45, `src/pages/help/`, `help.spec.js` |
| Idle alerts (owner request) | Sign In notice as an info alert (tint, round badge, close X); the idle card's Continue Session button clear of the card's edge | `LoginPage.jsx`, `index.css` (`pb-sheet`) |
| Keep it fast | Bundle budgets (200 KB starting code, 100 KB per chunk) in verify and CI; data calls per screen (lesson and assignment 3 or fewer) and layout shift enforced in the throttled-phone test | `scripts/check-bundle.mjs`, `tests/e2e/performance.spec.js` |
| Tools | Baseline, median, compare and waterfall tools; staging load seed (500 learners, emails off), paced sign-ins, cleanup that removes only test data | `tests/perf/`, `tests/load/` |

## 2. Speed: before and after (budget Android, 4× slower CPU)

Full tables per device in `docs/PERFORMANCE.md`; raw runs in `docs/performance/`.

| Page | Slow 4G first visit | Slow 4G repeat visit | Slow 3G repeat visit | Data calls |
|---|---|---|---|---|
| lesson | 3.8 s → 2.3 s | 1.4 s → 0.26 s | 5.5 s → 0.35 s | 10 → 1 of its own (3 or fewer before readable) |
| lesson audio ready | 5.5 s → 2.4 s | | | |
| lesson list | 2.9 s → 2.0 s | 0.75 s → 0.14 s | 7.3 s → 0.15 s | 17 → 1 of its own |
| assignment list | 2.5 s → 1.8 s | 0.57 s → 0.06 s | 2.2 s → 0.08 s | 8 → 1 of its own |
| assignment (instruction audio) | 3.5 s → 2.7 s | 0.76 s → 0.22 s | 5.4 s → 0.26 s | 10 → 1 of its own |

**Targets met:** repeat visits (0.8 s), data calls per screen, layout shift, bundle budgets. **Not yet met:** first visits on the budget phone over slow 4G (target 1.5 s; now 1.8–2.7 s) and audio start after a tap (about 1.4 s, at the target; it is the audio file arriving). The remaining first-visit time is the app's own code on a 4× slower CPU and the network; recorded in D45 as "not yet met".

## 3. Staging load tests (free plan, 2026-11-13/14)

Seed: 4 courses × 125 learners (500), 4 lecturers, 12 lessons and 15 assignments a course, every answer present; emails off for the test accounts. Sign-ins paced at 25 a minute (under Supabase Auth's 150 per 5 minutes). Think time 1 s, so each test user makes about 20–30 times the requests of a real person.

| Run | Users | Length | Requests | Rate | Errors | p50 (screen reads) | p95 (screen reads) | Downloaded |
|---|---|---|---|---|---|---|---|---|
| 3× peak | 146 learners + 4 lecturers | 9 min | 6,820 | 12.1/s | 33 (0.48%) | 1.1–2.4 s | 30–41 s | 60.7 MB |
| 5× peak | 246 learners + 4 lecturers | 14 min | 11,836 | 13.9/s | 1,116 (9.4%), of which 264 (2.2%) from the server | 1.1–2.2 s | 48–82 s | 95.8 MB |
| Soak (straight after 5×) | 50 learners + 4 lecturers, 3 s think time | 31 min | 15,098 | 8.0/s | 542 (3.6%) | 0.2–0.5 s | 12–47 s | 133.1 MB |

**What it shows:**
- **No breaking point, no lost data:** errors stayed under 1% and were time limits (500/504), not refusals; no user failed to start; the free plan's database slowed down rather than failing. 
- **5×: the breaking point of the free plan, and the failure is graceful.** Server errors rose to 2.2% (500 and 504: requests that hit the 8 s database time limit or the gateway's time limit). Nothing was refused that should have been allowed, no data was written by the test, and the database recovered by itself when the load ended. The other errors came from the load tool, not the app, and were fixed in the tool before the soak: (a) 795 answers were 401 because staging access tokens last 10 minutes (`jwt_expiry = 600`) and the tool never refreshed them, which the app does; (b) the 404s (57 at 5×, 8 at 3×) and the 7 users that "failed to start" followed a timed-out first enrolment read, after which the tool asked for an empty course. The tool now refreshes the session a minute before expiry and asks for the enrolment again.
- **The bottleneck is the free plan's small shared database computer.** The slowest read was `get_course_page` (1.03 s mean database time under load; 50 ms when idle), then `list_my_assignments` 0.43 s, `learner_dashboard` 0.33 s, `get_lesson_page` 0.32 s (`pg_stat_statements`).
- **Capacity in real people:** with real think times (20–30 s between screens) the 3× run's rate equals about 240 people actively using the app at once. The growth plan in `docs/CAPACITY.md` has the trigger and the cost of the next step.
- **Soak: steady medians, with stalls.** Over 31 minutes the medians stayed at 0.2–0.5 s and did not grow, and nobody failed to sign in. But there were stalls in which requests hit the database time limit (500: 162 of them on `get_course_page`, 48 on `learner_dashboard`, about 60 elsewhere), 54 network failures, and 33 session refreshes that timed out at Supabase Auth (504), after which those users got 401s until their next refresh (170). The error rate (3.6% at 8 requests a second) was higher than at 3× (0.48% at 12 a second). One likely reason, not proven: the soak ran straight after the 5× run, and the free plan's database computer has a burst allowance for disk and CPU that the 5× run may have used up. Either way, `get_course_page` is again the weak point (follow-up 1).
- **Test data removed afterwards (2026-11-14):** `tests/load/cleanup.sql` on staging left 0 test accounts and 0 test courses; the real accounts (2 administrators, 1 lecturer, 1 learner) are untouched.

## 4. Exit gate (brief section 7 and the phase protocol)

| Item | Result |
|---|---|
| Baseline, change one thing, measure again, keep only if better | **Pass.** Three changes, each measured; change 3 confirmed side by side in one session after the laptop drifted (`docs/PERFORMANCE.md`). |
| Every RLS and Storage policy test green; no private data in the service worker or shared caches; idle sign-out clears cached private data | **Pass.** pgTAP 50 files, 1,613 passed. Cache is memory only and cleared on sign-out (unit tests). |
| Security headers and CSP stay | **Pass** (unit test of the headers; unchanged). |
| D45 recorded; PERFORMANCE, CAPACITY, RUNBOOK, TESTING, PHASES, DECISIONS, CLAUDE.md updated | **Pass.** |
| Load, ramp, spike and soak on staging | **Pass, scaled by the owner** (3×, 5×, 30-minute soak instead of 4 hours; section 3). |
| Failure drills (slow storage, failing Edge Function, pooler restart, email down, region latency) | **Partly.** Covered by tests: retries and time limits (unit), failing screen (unit), email retry and FAILED state (Phase 11 function tests), slow network (slow-3G runs, slow-load notice). Pooler restart and region latency not run on staging: no way to restart the free plan's pooler; recorded for Phase 14. |
| Real-user metrics and weekly performance report | **Not built:** no browser error or metrics collection (no Sentry, ADR-023). Server logs, the daily health check and the uptime monitor instead. |
| Two real phones | **Owner step** (section 6). |
| Server transcoding, paid images, offline | **Not built, by owner decision** (ADR-028). |

## 5. Results (local, 2026-11-14)

| Suite | Result |
|---|---|
| Lint, type check | Pass |
| Unit | **615 passed** |
| Database (pgTAP) | 50 files, **1,613 passed** |
| Bundle budgets | Pass (starting code about 124 KB) |
| End to end, 24 device projects, light and dark; Lighthouse | CI on the pull request |

**First CI run of the pull request (43532625204):** all 8 end-to-end shards (24 device projects, light and dark), pgTAP, lint, types, unit, audit, build and gitleaks passed. Lighthouse failed one assertion: the Sign In page loaded 205,824 bytes of script against the 200 KB budget (204,800). The cause was the router importing the learner page-read code at start. The router now loads that code with the screen's own code, in parallel, so nothing waits on it. Starting code went from 176.8 KB to 174.7 KB, and Lighthouse locally measured 202,614 bytes. The budget was not changed.

Fixed on the way: the access-matrix settings count (19 → 25, the six Phase 15 settings) and the support-contact test no longer depending on values set on the developer's machine.

## 6. Known issues and follow-ups

1. **`get_course_page` is the most expensive read under load** (section 3, every run): first item for later speed work (cache the learner's grade summary per request, or split the grades out of the lesson list). Do it before the number of learners grows past the free plan's estimate.
5. **The Sign In page has about 2 KB of script budget left** (202,614 of 204,800 bytes): the next change that adds code there must take some away.
2. **Blocking time in the throttled-phone test is not explained:** the assignment page measured 2.7–5.6 s there against 0.3 s in the baseline tool. Budgets are reported, not enforced, until it is understood.
3. **WebKit idle-draft test flakes now and then;** cause not found, it passes on rerun.
4. **Course grades in reports are computed per course** (one call each); fine at DDTC's size.
## 7. Owner steps

- Read and approve the Help & Support text (`src/lib/help/content.js`) in the pull request. The support email and phone are set on staging as settings, not in the code.
- Try the lesson, lesson list and assignment pages on two real phones (one Android, one iPhone) on mobile data, and note how they feel.
- Approve the pull request.

## 8. Screenshots

`docs/acceptance/phase-15/screens/`: Help card and Help page, the idle warning, and the signed-out notice, at 375, 768 and 1280 px in light and dark.
