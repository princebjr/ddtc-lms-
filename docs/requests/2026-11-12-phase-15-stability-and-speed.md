# Owner request: Phase 15 "Stability and speed" (received 2026-11-12)

**Status:** filed, not started. It begins after v1.0.0 is signed off (after Phase 14). Before planning it, ask the owner the five questions at the end (with a recommended default for each) and wait for the answers.

The brief below is the owner's, word for word.

---

TASK: Phase 15 "Stability and speed". The app is built and signed off (v1.0.0). Make it stable under any realistic load and make retrieving lessons and assignments, with their text and audio, very fast on every device and network. Follow CLAUDE.md and the phase protocol: write a plan first and WAIT FOR MY APPROVAL; measure before and after every change; run npm run verify; evidence in docs/acceptance/phase-15.md; one pull request; tag phase-15-done. Record ADR D45 "Performance and stability standard". Read docs/CAPACITY.md if it exists and extend it; do not repeat it.

HARD RULES (nothing here may weaken them)
- Every RLS and Storage policy test stays green. Private files are never cached by the service worker or any shared cache. Idle sign-out clears all cached private data. No stored grade aggregates without an ADR. Security headers and CSP stay.
- Work scientifically: baseline, profile, change ONE thing, re-measure, keep it only if it improves the number and every test passes; otherwise revert and note it. No guessing.

1. BASELINE FIRST (write results to docs/PERFORMANCE.md)
Measure the current app on: a throttled low-end Android (4x CPU slowdown, slow 4G and a slow 3G profile), iPhone SE, iPad, desktop, and on at least two real phones. Record for the lesson page, lesson list, assignment list, assignment page (with instruction audio), submission page, grading page, gradebook, dashboards: TTFB, FCP, LCP, INP, CLS, time to readable text, time until audio can play after a tap, number of requests, payload size, database time per request, JS and main-thread cost. Also record real-user metrics (Web Vitals by device class and network) once collection exists.

2. TARGETS (p75 unless stated; first visit on throttled mid-range Android over 4G; repeat visits should be much faster)
- Lesson page: title and text readable within 1.5 s first visit and 0.8 s on a repeat visit; audio controls ready at the same time.
- Audio starts within 1.5 s of the tap; a seek responds within 0.5 s.
- Lesson list and assignment list: usable within 0.8 s.
- Assignment page including text and instruction audio: 1.5 s.
- API calls per page: lesson page 3 or fewer, lists 2 or fewer; never more than 2 sequential requests (no waterfalls).
- Lesson data payload 30 KB gzipped typical; initial JS 200 KB gzipped; route chunk 100 KB; CLS 0.1; INP 200 ms; 50 fps scrolling on the low-end profile.
- On slow 3G: text first, audio loads on demand, nothing blocks.

3. FASTER RETRIEVAL OF LESSONS AND ASSIGNMENTS

Data
- One round trip per screen: create read functions or views that return everything a screen needs, for example get_lesson_page (lesson text, active audio metadata and waveform peaks, attachments, previous and next lesson, the learner's progress), get_assignment_page, list_my_courses, list_my_assignments (with status, due date and grade summary), get_course_lessons (with progress). They must run with the caller's rights (security invoker) so RLS still applies, or, if a definer function is unavoidable, contain explicit checks that are tested.
- Select only needed columns; keyset pagination; no unbounded results; indexes proven with EXPLAIN (ANALYZE, BUFFERS) on the seed from CAPACITY.md; partial and covering indexes where measured; precompute word counts, reading time and audio duration at save.
- Lesson text is sanitised HTML stored once; send it compressed (Brotli or gzip); render long lessons progressively (`content-visibility`), never block on images.

Audio
- Peaks and duration are computed once at validation and returned with the lesson; the waveform draws instantly from stored peaks.
- Create the signed URL when the lesson page opens (one call), reuse it from memory until shortly before it expires so the browser cache and range requests work; never sign URLs in bulk for a list; download uses its own short URL.
- preload="metadata", HTTP range requests, correct content types, sensible cache headers on immutable files (a new upload is always a new file id), no autoplay, and first bytes fast: start playing while buffering.
- Check the audio formats and bitrates people actually upload. Propose (ADR, do not build without approval) optional server-side transcoding to speech-friendly AAC or Opus (about 64 to 96 kbps mono), with cost and complexity, and add client-side guidance in the upload screen now.

Client
- A data layer with stale-while-revalidate, per-user cache keys, request de-duplication and sensible stale times; private data cached in memory only and cleared on sign-out and idle sign-out.
- Prefetch on intent: next lesson, the assignment the learner is about to open, on hover, touch start or when it enters view; optimistic updates for lesson completion and progress with rollback.
- Route-level code splitting; lazy-load the rich-text editor (lecturers only), charts, recorder and waveform code; tree-shake icons; drop unused dependencies; analyse the bundle and cut the biggest items first.
- Fonts: Inter self-hosted, variable woff2 subset to Latin, preload the one file used above the fold, font-display: swap.
- Images and covers: generate WebP thumbnails at 3 sizes on upload (or use platform image transformation if the plan includes it), srcset, lazy loading, fixed dimensions to avoid layout shift, avatars at 64 and 128 px.
- Network: preconnect to the Supabase and storage origins, HTTP/2 or HTTP/3, long-lived hashed assets, fetch priorities, no duplicate requests, abort requests on navigation.
- Low-end devices: detect low memory or few cores and switch to a light mode (solid navigation bar without blur, fewer animations, smaller lists, no shimmer); honour reduced motion; profile and remove unnecessary re-renders; virtualise long lists.
- Skeletons must match the layout and appear only after 150 ms.

4. STABILITY
- Error handling: an error boundary per route with a friendly retry; timeouts and aborts on every request; retries with exponential backoff and jitter for safe (read) requests only; idempotency keys on every write that can be repeated (submit, upload registration, release grades, enrolment, imports); a user never sees a blank screen.
- Graceful degradation order (document it): if audio fails show the text; if realtime fails fall back to polling; if exports or reports are overloaded queue or pause them with a banner; sign-in, lessons and submissions are protected last. Add kill switches in system_settings for heavy features, tested.
- Data integrity under load: transactions and row locks for grade release and submission versions, unique constraints for idempotency, advisory locks so scheduled jobs never overlap, dead letter handling for failed jobs and emails, no duplicate notifications.
- Database safety: statement and idle-in-transaction timeouts, connection pooling as in CAPACITY.md, slow-query logging with pg_stat_statements, a vacuum and bloat check, and an alert before storage or connection limits are reached.
- Release safety: migrations are backward compatible (add, migrate, then remove), indexes use CONCURRENTLY, every migration is rehearsed on a production-sized copy, previews and staging soak before production, one-click rollback documented and tested, feature flags for risky changes, release health tracked in Sentry.
- Backups and recovery already specified stay in force; run one more restore drill after this phase.

5. LOAD, STRESS AND FAILURE TESTS (staging only)
Reuse tests/load from CAPACITY.md and add: a ramp to 3 times and then 5 times the expected peak to find the breaking point and prove the failure is graceful (rate limits, queues, banners, no data loss); a spike test (deadline rush); a 4-hour soak; and failure drills (slow storage, a failing Edge Function, pooler restart, email provider down, region latency). Correctness checks run during every test: grades stay exact, RLS still denies cross-user access, no duplicate or lost submissions, audit entries complete.
Write the 10 times plan in docs/CAPACITY.md: for each growth step the numeric trigger, the action, the cost and who approves (bigger compute, read replicas, CDN for audio, transcoding queue).

6. KEEP IT FAST FOREVER
- CI gates added to npm run verify: Lighthouse budgets, bundle size limits, API-calls-per-page limits, query-time limits on the key functions, and a failing build on regression.
- Real-user monitoring by device class, network and region; weekly performance report; alerts on p75 regressions; a performance review checklist in the pull request template.
- Update CLAUDE.md, TESTING.md, RUNBOOK.md, PHASES.md and DECISIONS.md (D45).

7. DELIVERABLES
docs/PERFORMANCE.md (baseline, changes, results, before and after tables and charts per device), updated docs/CAPACITY.md, migrations and functions, tests and load scripts, CI gates, runbook updates, the evidence file, and a plain-language summary for me with what got faster by how much, what it costs, and what you chose not to do.

BEFORE YOU START, ASK ME (with your recommended default): the lowest phone and network we must support; whether to approve server-side audio transcoding; whether to approve paid image transformation; the monthly budget; and whether any offline reading is wanted (current plan: no). Stop and wait for my answers.
