# DDTC LMS: Toasts, floating action buttons and skeleton screens

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 16. Interface feedback: toasts, floating action buttons and skeleton screens

This section is the complete and only list of toasts and floating action buttons in the product. Any addition needs an ADR in `docs/DECISIONS.md`.

### Toast rules

- A toast confirms something that has already happened or reports something the user could not see. It never asks for a decision.
- Success toasts last 4 seconds. Info toasts last 5 seconds. Warning toasts last 8 seconds. Error toasts stay until dismissed and offer Retry where retrying is possible.
- Reversible actions (suspend, archive, withdraw, unpublish) show a 6-second toast with an Undo button. Undo is also audited.
- At most 3 toasts are visible; the same message is never shown twice at once; a burst of identical events becomes one toast with a count.
- Placement: bottom of the screen on phones, above the tab bar, any floating action button and the safe area; top right on desktop. Toasts are announced to screen readers through an `aria-live` region, can be dismissed with a tap or the Escape key, and pause their timer while focused or hovered.
- Toasts never contain private data beyond what the user is already viewing (for example no other learner's marks).
- Not toasts: field validation errors (inline), destructive confirmations (dialog), upload and recording progress (progress bar), and blocked states such as suspended account or no permission (full-page state).

### Toast catalogue

Type: S = success, I = info, W = warning, E = error.

| Role | Action | Toast (type) | Button on toast |
|---|---|---|---|
| Everyone | Profile saved | "Profile saved" (S) | none |
| Everyone | Profile photo updated | "Photo updated" (S) | none |
| Everyone | Profile photo rejected | "Photo not accepted: reason" (E) | Try again |
| Everyone | Password changed | "Password changed" (S) | none |
| Everyone | Verification email resent | "Verification email sent" (S) | none |
| Everyone | Signed out | "You have signed out" (I) | none |
| Everyone | Connection lost | "You are offline" (W, stays until back online) | none |
| Everyone | Connection restored | "Back online" (S) | none |
| Everyone | New notification arrives | Notification title (I) | Open |
| Everyone | New app version ready | "New version available" (I, stays) | Refresh |
| Everyone | Session about to expire | "Your session ends in 2 minutes" (W) | Stay signed in |
| Everyone | Any save or request fails | "Could not save. Try again" (E) | Retry |
| Administrator | Learner added or invitation sent | "Learner added" (S) | none |
| Administrator | Lecturer provisioned | "Lecturer invited" (S) | none |
| Administrator | Administrator invited (ADR-003) | "Administrator invited" (S) | none |
| Administrator | CSV import finished | "Imported N learners, M errors" (S or W) | View report |
| Administrator | Role or course-creation permission changed | "Permissions updated" (S) | none |
| Administrator | Account suspended or reactivated | "Account suspended" or "Account reactivated" (S) | Undo |
| Administrator | Administrator MFA reset | "MFA reset for name" (S) | none |
| Administrator | Course approved | "Course approved and published" (S) | none |
| Administrator | Course returned with reason | "Course returned to lecturer" (S) | none |
| Administrator | Course archived | "Course archived" (S) | Undo |
| Administrator | Learners enrolled | "N learners enrolled" (S) | Undo |
| Administrator | Enrolment status changed | "Enrolment updated" (S) | Undo |
| Administrator | Course owner transferred | "Owner changed" (S) | none |
| Administrator | System setting saved | "Setting saved" (S) | none |
| Administrator | Retention hold placed or released | "Hold placed" or "Hold released" (S) | Undo |
| Administrator | Retention switched on or off | "Retention enabled" or "Retention disabled" (W) | none |
| Administrator | Report or export ready | "Export ready" (S) | Download |
| Lecturer | Course saved as draft | "Draft saved" (S) | none |
| Lecturer | Course submitted for approval | "Submitted for approval" (S) | none |
| Lecturer | Course published | "Course published" (S) | none |
| Lecturer | Co-lecturer added or removed | "Co-lecturer added" or "Co-lecturer removed" (S) | Undo |
| Lecturer | Lesson saved | "Lesson saved" (S) | none |
| Lecturer | Lesson published or unpublished | "Lesson published" or "Lesson unpublished" (S) | Undo |
| Lecturer | Lessons reordered | "Order saved" (S) | Undo |
| Lecturer | Lesson audio passes checks | "Audio ready" (S) | none |
| Lecturer | Lesson audio rejected | "Audio rejected: reason" (E) | Try again |
| Lecturer | Lesson audio replaced | "Audio replaced" (S) | none |
| Lecturer | Attachment added | "Attachment added" (S) | none |
| Lecturer | Assignment saved or published | "Assignment saved" or "Assignment published" (S) | none |
| Lecturer | Extension granted | "Extension granted" (S) | Undo |
| Lecturer | Grade draft saved | "Grade saved as draft" (S) | none |
| Lecturer | Grades released | "Grades released to N learners" (S) | none |
| Lecturer | Score out of range | "Score must be between 0 and maximum" (E) | none |
| Lecturer | Submission reopened | "Submission reopened" (S) | none |
| Lecturer | Gradebook export ready | "Export ready" (S) | Download |
| Learner | Lesson marked complete or incomplete | "Lesson completed" or "Marked not complete" (S) | Undo |
| Learner | Audio download starts | "Downloading audio (size)" (I) | none |
| Learner | Recording saved or discarded | "Recording saved" or "Recording discarded" (S) | none |
| Learner | Microphone blocked | "Microphone blocked. Upload a file instead" (W) | Upload file |
| Learner | Submission received | "Submission received" (S) | none |
| Learner | Late submission received | "Submitted late" (W) | none |
| Learner | Resubmitted | "Resubmitted as version N" (S) | none |
| Learner | File rejected | "File not accepted: reason" (E) | Try again |
| Learner | Upload interrupted then resumed | "Upload resumed" (I) | none |
| Learner | Grade released | "New grade available" (I) | View |

### Floating action buttons

- One floating action button (FAB) per screen at most, only for the main "create" action of that screen, only on phones and tablets (below 1024 px). On desktop the same action is a normal button in the page header.
- 56 px round button at the bottom right, 16 px from the edge, above the tab bar and the safe area, with a text label for screen readers. It hides while scrolling down, returns on scroll up, and hides while the on-screen keyboard is open.
- A FAB with more than one action opens a speed dial: a scrim, labelled actions, closes on tap outside, back or Escape.
- A FAB is not shown when the user lacks permission or the course is ARCHIVED.
- Save, Submit, Release and Next use a sticky action bar, never a FAB. Destructive actions, per-row actions, Download, Record, and Mark complete never use a FAB.

| Screen | FAB | Visible to |
|---|---|---|
| Administrator, Users | Speed dial: Add learner, Provision lecturer, Invite administrator (ADR-003), Import CSV | Administrator |
| Administrator, Courses | New course | Administrator |
| Administrator, Enrolments | Enrol learners | Administrator |
| Lecturer, My Courses | New course | Lecturer with `can_create_courses` |
| Course, Lessons tab | Add lesson | Course OWNER or CO_LECTURER |
| Course, Assignments tab | New assignment | Course OWNER or CO_LECTURER |
| Course, Learners tab (lecturer) | none (enrolment is administrator-only) | none |
| All learner screens | none | none |

### Skeleton screens

- Every page that loads data shows a skeleton that matches its final layout, so content does not jump when it arrives (CLS at or below 0.1). Use the shadcn `Skeleton` component and shared skeleton components, never a lone spinner for a page.
- Timing: show the skeleton only if loading takes longer than 150 ms, and once shown keep it for at least 300 ms to avoid flicker.
- Session check: while the app checks the session, show the skeleton of the page being opened (or a neutral shell). A signed-in user never sees a flash of the Sign In page, and a signed-out user never sees a flash of protected content. This is the Authentication Loading State.
- Accessibility: the loading region has `aria-busy="true"` and a visually hidden "Loading" label; shimmer is replaced by a static grey block when the user prefers reduced motion.
- If data has not arrived after 10 seconds, replace the skeleton with an error state and a Retry button. Loading, empty and error states must look clearly different from each other.
- Button actions use an inline spinner inside the button, and file uploads use a progress bar. Neither uses a page skeleton.
- Repeat counts match the page size (for example 20 list rows on a phone) but never more than fit one screen.

| Screen | Skeleton shape |
|---|---|
| Sign In, Sign Up, recovery | Card with field blocks and a button block; brand line stays visible |
| Dashboards (all roles) | Row of summary-card blocks and 3 list-row blocks |
| Lists and tables (users, courses, enrolments, results) | Table header and rows on wide screens; stacked card blocks with an avatar circle on phones |
| Course workspace | Course title bar, tab bar blocks, then the active tab's skeleton |
| Lesson page | Title line, text lines, full-width player bar, Previous and Next blocks |
| Lesson list (lecturer) | Rows with a drag handle block, title line and status chip |
| Assignment list and detail | Cards with title, due-date chip and status chip; detail has instruction lines and an audio bar |
| Submission screen | Instruction lines, response-type selector blocks, a large input block |
| Grading screen | Submission area block and a grading panel with field blocks |
| Gradebook | Sticky first column blocks and a grid of cells; per-learner cards on phones |
| Charts | Chart frame with six grey bars and axis lines, plus a text-summary line |
| Notifications | List rows with a small circle and two text lines |
| Profile and settings forms | Label and input blocks, avatar circle |
| Avatars | Grey circle until the image loads, then the image, or initials if it fails |

### Tests for interface feedback

- Unit tests: toast durations, de-duplication, maximum of 3 and Undo behaviour; skeleton 150 ms and 300 ms timing; FAB appears only below 1024 px, only with permission, hides on scroll and when the keyboard is open.
- Playwright with a throttled network on every device project: skeleton appears, content replaces it with no layout shift above 0.1, no flash of Sign In or of protected content, and the 10-second error state works.
- Each catalogue action is covered by at least one test that checks its toast text and, where listed, its button.
