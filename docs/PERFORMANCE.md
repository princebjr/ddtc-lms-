# DDTC LMS: Performance

Phase 15 (D45). Baseline, every change with its before and after, and results per device. The tools are in `tests/perf/` and `tests/load/`; capacity and growth are in `docs/CAPACITY.md`.

## How it is measured

`node tests/perf/baseline.mjs --runs 3 --json <file>` creates its own course with realistic content and loads each screen as the person who uses it:
- **The course:** 12 lessons of about 1,200 words, each with 60 s of lesson audio and a stored waveform; an assignment with instruction audio, the learner's answer, and a second assignment still to do.
- **What is recorded:**
  - **Readable:** time until the page's own text is on screen, the brief's "time to readable text".
  - **Repeat visit:** opening the same page again inside the app.
  - **Audio ready:** time until the Play button can be used. **Audio starts:** from a tap on Play until the audio plays.
  - **Page metrics:** LCP and CLS, plus TBT (blocking time) as a stand-in for INP, since a scripted run has no real input delay to measure.
  - **Data calls:** calls to Supabase, not counting audio bytes.

`node tests/perf/median.mjs <file>` takes the median of the runs. Raw data is in `docs/performance/`.

**Profiles** (the lowest supported device, owner decision for Phase 15: a 2 GB Android in Chrome):
- **Budget Android, slow 4G:** Chromium on a Pixel 7 screen, CPU 4 times slower, slow 4G (150 ms round trip, 1.6 Mbit/s).
- **Budget Android, slow 3G:** the same phone on DevTools "Slow 3G" (2 s round trip, 400 kbit/s).
- **iPhone SE, iPad:** WebKit. WebKit cannot be throttled, so these show the engine, not a slow network.
- **Desktop:** not throttled.

**Where:** the developer's laptop. The local stack has 2.8 GB of Docker memory and the preview build is served locally, so times are pessimistic for the database and optimistic for the network (no internet distance). Before and after are always compared on the same machine with the same tool. Staging runs and two real phones are added in the results section.

## Baseline (2026-11-13, before any Phase 15 change)

Medians of 3 runs. Targets (D45, p75, first visit on a mid-range Android over 4G):
- the lesson and assignment pages readable within 1.5 s, the lesson page within 0.8 s on a repeat visit;
- audio playing within 1.5 s of the tap;
- lists usable within 0.8 s;
- 3 or fewer data calls on the lesson page and 2 or fewer on lists;
- CLS 0.1.

**Budget Android, slow 4G (CPU 4x slower)**

| Page | Readable | Repeat visit | Audio ready | Audio starts after tap | LCP | CLS | Blocking (TBT) | Data calls |
|---|---|---|---|---|---|---|---|---|
| learner dashboard | 3.6 s | 1.1 s | – | – | 2.3 s | 0 | 572 ms | 8 |
| lesson list (course) | 2.9 s | 748 ms | – | – | 3.0 s | 0 | 231 ms | 17 |
| lesson | 3.8 s | 1.4 s | 5.5 s | 1.4 s | 3.9 s | 0.024 | 390 ms | 10 |
| assignment list | 2.5 s | 571 ms | – | – | 2.0 s | 0.005 | 103 ms | 8 |
| assignment (instruction audio) | 3.5 s | 762 ms | 4.0 s | 1.5 s | 3.5 s | 0.017 | 343 ms | 10 |
| lecturer dashboard | 2.7 s | 625 ms | – | – | 2.2 s | 0 | 153 ms | 8 |
| grading (one answer) | 3.3 s | 567 ms | – | – | 3.3 s | 0 | 222 ms | 6 |
| gradebook | 4.9 s | 1.8 s | – | – | 3.9 s | 0 | 429 ms | 9 |

**Budget Android, slow 3G (2 s round trip)**

| Page | Readable | Repeat visit | Audio ready | Audio starts after tap | LCP | CLS | Blocking (TBT) | Data calls |
|---|---|---|---|---|---|---|---|---|
| learner dashboard | 23.4 s | 4.4 s | – | – | 19.2 s | 0 | 250 ms | 8 |
| lesson list (course) | 25.2 s | 7.3 s | – | – | 25.4 s | 0 | 140 ms | 17 |
| lesson | 23.5 s | 5.5 s | 27.7 s | 6.9 s | 23.6 s | 0.024 | 165 ms | 10 |
| assignment list | 17.1 s | 2.2 s | – | – | 14.9 s | 0.006 | 47 ms | 8 |
| assignment (instruction audio) | 29.3 s | 5.4 s | 33.5 s | 6.9 s | 29.4 s | 0.017 | 226 ms | 11 |
| lecturer dashboard | 21.1 s | 2.2 s | – | – | 19.0 s | 0 | 57 ms | 9 |
| grading (one answer) | 27.0 s | 3.3 s | – | – | 27.1 s | 0 | 192 ms | 6 |
| gradebook | 35.4 s | 4.5 s | – | – | 33.2 s | 0 | 289 ms | 9 |

**iPhone SE (WebKit, not throttled)**

| Page | Readable | Repeat visit | Audio ready | Audio starts after tap | LCP | CLS | Blocking (TBT) | Data calls |
|---|---|---|---|---|---|---|---|---|
| learner dashboard | 1.2 s | 375 ms | – | – | 826 ms | 0 | 0 ms | 9 |
| lesson list (course) | 1.5 s | 592 ms | – | – | 1.5 s | 0 | 0 ms | 17 |
| lesson | 1.3 s | 851 ms | 1.4 s | 426 ms | 1.4 s | 0 | 0 ms | 11 |
| assignment list | 1.5 s | 574 ms | – | – | 809 ms | 0 | 0 ms | 9 |
| assignment (instruction audio) | 1.9 s | 705 ms | 2.2 s | 740 ms | 2.0 s | 0 | 0 ms | 11 |
| lecturer dashboard | 784 ms | 200 ms | – | – | 589 ms | 0 | 0 ms | 10 |
| grading (one answer) | 934 ms | 160 ms | – | – | 1.4 s | 0 | 0 ms | 7 |
| gradebook | 1.5 s | 702 ms | – | – | 1.0 s | 0 | 0 ms | 10 |

**iPad (WebKit, not throttled)**

| Page | Readable | Repeat visit | Audio ready | Audio starts after tap | LCP | CLS | Blocking (TBT) | Data calls |
|---|---|---|---|---|---|---|---|---|
| learner dashboard | 1.3 s | 660 ms | – | – | 739 ms | 0 | 0 ms | 8 |
| lesson list (course) | 1.4 s | 564 ms | – | – | 1.5 s | 0 | 0 ms | 17 |
| lesson | 985 ms | 332 ms | 1.2 s | 228 ms | 1.1 s | 0 | 0 ms | 11 |
| assignment list | 819 ms | 186 ms | – | – | 721 ms | 0 | 0 ms | 9 |
| assignment (instruction audio) | 927 ms | 257 ms | 1.1 s | 312 ms | 1.0 s | 0 | 0 ms | 11 |
| lecturer dashboard | 648 ms | 152 ms | – | – | 594 ms | 0 | 0 ms | 8 |
| grading (one answer) | 737 ms | 131 ms | – | – | 795 ms | 0 | 0 ms | 7 |
| gradebook | 1.1 s | 210 ms | – | – | 1.0 s | 0 | 0 ms | 10 |

**Desktop (not throttled)**

| Page | Readable | Repeat visit | Audio ready | Audio starts after tap | LCP | CLS | Blocking (TBT) | Data calls |
|---|---|---|---|---|---|---|---|---|
| learner dashboard | 992 ms | 507 ms | – | – | 508 ms | 0.015 | 0 ms | 7 |
| lesson list (course) | 974 ms | 475 ms | – | – | 1.0 s | 0 | 0 ms | 16 |
| lesson | 938 ms | 106 ms | 1.2 s | 156 ms | 972 ms | 0.011 | 0 ms | 10 |
| assignment list | 251 ms | 138 ms | – | – | 216 ms | 0.001 | 0 ms | 8 |
| assignment (instruction audio) | 1.1 s | 141 ms | 1.3 s | 154 ms | 1.1 s | 0.007 | 0 ms | 10 |
| lecturer dashboard | 302 ms | 88 ms | – | – | 324 ms | 0 | 0 ms | 7 |
| grading (one answer) | 418 ms | 474 ms | – | – | 440 ms | 0 | 0 ms | 6 |
| gradebook | 538 ms | 188 ms | – | – | 412 ms | 0 | 0 ms | 9 |

**What the baseline shows**
- **Every page misses its target on the budget Android.** On slow 4G, pages become readable after 2.5–4.9 s; the target is 0.8 s for lists and 1.5 s for lesson and assignment pages.
- **On slow 3G the number of round trips decides everything:**
  - pages take 17–35 s;
  - each request made after another one costs about 2 s;
  - the app makes several before any data arrives: the code, the session, the profile and settings, the page's code, then the page's data.
- **Too many data calls:**
  - the lesson list (course page) makes 17;
  - the lesson and assignment pages make 10 each, against a target of 3;
  - the learner dashboard makes 8.
- **Audio ready waits behind a chain:** the page data, then drawing the page, then loading the file-storage code, then signing the link, then the audio's details. On slow 4G that's 5.5 s on the lesson page.
- **Layout shift is fine everywhere:** 0.024 at most.
- **Desktop and iPad are mostly within targets already,** so the work is for phones and slow networks.
- **Repeat visits fetch everything again,** because nothing is cached between pages.

## Changes

Each change is measured with the same tool on the same machine, kept only if it improves the numbers and every test passes.
