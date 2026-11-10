# Step 9.1 acceptance evidence: To grade, Grades and feedback, and 16:9 course covers

- Branch: `phase-9-1-grading-pages`. Reviewer (O2): Prince Boateng. Evidence date: 2026-11-10.
- Why: after Phase 9 was merged the owner found the lecturer's **To grade** and the learner's **Grades** still showing "arrives in Phase 9". The navigation map promised both for Phase 9, but they were not in the phase file and were missed. Plan approved by the owner on 2026-11-10.
- Added by the owner during the step (2026-11-10): crop any course cover photo to the course card's frame, whatever the photo's size.

## 1. What was built

| Item | Where |
|---|---|
| `grading_queue()`: for the courses the caller manages (active lecturer courses; every course for an AAL2 administrator), the answers waiting to be graded (sent or reopened) and the draft grades not released (a released grade changed since included), oldest first, never in an archived course | Migration `20261110000100_grading_pages.sql` |
| `my_grades()`: the signed-in learner's answered assignments in courses they are enrolled in (active or completed). Each is either released, with the released score, percentage, letter grade, band, pass, feedback, release time and Updated, or awaiting, with no score or feedback | Same migration |
| **To grade:** answers waiting with the learner (photo, name, ID number, branch chip), assignment and course, time sent, Reopened and Late; Grade opens the grading screen. A course filter appears with more than one course; draft grades not released are listed per assignment, each opening that assignment's Submissions page to release them. The lecturer dashboard gains a To grade tile ("in N assignments") | `src/pages/lecturer/ToGradePage.jsx`, `LecturerDashboardPage.jsx`, `src/components/grading/LearnerCell.jsx` |
| **Grades and feedback:** the learner's assignments grouped by course: released (score, percentage, Grade chip, feedback, band, release date, Updated) or Awaiting grade; each opens its assignment | `src/pages/learner/LearnerGradesPage.jsx` |
| **Course covers cropped to 16:9:** a box sized by aspect ratio grows to fit its content unless it clips, so a tall photo stretched the card. `CourseCover` (a clipping 16:9 frame with the photo laid over it, `object-cover`) is now used on the course card, the workspace preview and the learner's course page | `src/components/courses/CourseCover.jsx` |

The course grade and the score chart shown in the prototype's learner Grades screen come with Phase 10 (`calculate_course_grades`).

## 2. Tests and results (local, 2026-11-10)

| Suite | Result |
|---|---|
| Lint, type check, build | pass |
| Unit | 33 files, 470 tests, pass (new: 6 in `grading-pages.test.jsx`) |
| Database (pgTAP) | 22 files, 1,004 tests, pass (new: pgTAP 21, 19 checks, written first and seen failing: "function grading_queue() does not exist") |
| Edge Function integration | unchanged (no function changes) |
| End to end, local | **Step 9.1 grading test:** desktop Chrome, desktop Firefox, the 320 px phone, Pixel 7: 4 of 4. **Tall-cover test (`course-cover.spec.js`, a real 400 x 1200 PNG):** 4 of 4 on the same projects. Run against the old cover CSS, the frame measured 254 x 762 and the test failed, reproducing the owner's report. The Phase 6 cover-and-media test passed on desktop Chrome, desktop Firefox and the 320 px phone. On Pixel 7 one run failed waiting for "Lesson saved" after its cover steps; two reruns on Pixel 7 (light and dark) passed. Local WebKit still hangs, so CI covers Safari's engine and the iPads |
| CI | on the pull request (see its checks) |

**Test fixes while making the tests pass:**
- pgTAP 21's administrator check counts only its own courses, because a local database holds courses from earlier runs.
- The To grade unit test waits for the list itself: while the skeleton keeps its 300 ms, the loaded content is hidden, so a role query run straight after the summary appeared failed now and then.

**Found by the screenshot review and fixed:** the Awaiting grade chip stretched across the row on phones.

## 3. Screenshots

`docs/acceptance/phase-09-1/screens/`, 24 images at 375, 768 and 1280 px in light and dark:
- `lecturer-dashboard` (the To grade tile);
- `lecturer-to-grade`;
- `learner-grades`;
- `lecturer-my-courses-cover` (a 400 x 1200 cover cropped to 16:9).

They were captured with a check for sideways scrolling and console errors; none found.

## 4. Owner steps

Staging, before merging: `npx supabase db push --linked` (adds `20261110000100`). No functions changed.

## 5. Known issues

None new. The open items from Phase 9 still stand: the notification centre in Phase 11, the gradebook in Phase 10, and the CI gate re-run weakness proposed for Phase 13.
