# DDTC LMS: System Architecture

Version 1.7. How the Dynamic Discipleship Training Centre Learning Management System works, written so that you can check each part against your preferences. The full rules and numbered decisions (D01 to D40) are in `docs/BUILD_PLAN.md`; if the two ever differ, BUILD_PLAN wins.

## 1. Preference check

Tick each row once you have confirmed the architecture does what you want.

| # | Your preference | How the architecture meets it | Verified |
|---|---|---|---|
| 1 | One institution, three roles: Administrator, Lecturer, Learner | Section 4; every table and screen is role-aware | [ ] |
| 2 | No public marketing homepage; visitors go to Sign In | Section 5: `/` sends signed-out visitors to Sign In | [ ] |
| 3 | Email and password for everyone, plus Continue with Google for learners only on the Sign In and Sign Up pages; no Apple or other social sign-in | Section 5 and D22, D27 | [ ] |
| 4 | Public sign-up always creates a Learner; lecturers and admins are provisioned by an administrator | Section 5 and Section 11 | [ ] |
| 5 | The gölarae logo with the text "from gölarae" directly beneath it, below the Sign In form and the Sign Up form; never "powered by gölarae" | Section 5 and Section 20 | [ ] |
| 6 | No academic terms, semesters or class groups | Section 7: courses are standalone; the learner's period is their enrolment | [ ] |
| 7 | A course contains lessons only; there is no module layer | Section 7: Course, then ordered Lessons | [ ] |
| 8 | Lecturers create multiple courses and lessons; assignments with text, audio or both | Sections 8 and 9 | [ ] |
| 9 | Lecturers and learners can play and download lesson audio | Sections 9 and 10 | [ ] |
| 10 | Learners submit text, recorded audio, uploaded audio, PDF or Word | Section 9 | [ ] |
| 11 | Grading, feedback, course gradebook, score distribution charts | Sections 9 and 12 | [ ] |
| 12 | Every user has an avatar with initials fallback | Section 6 | [ ] |
| 13 | Learner assignment audio can be deleted automatically; lesson audio never is | Sections 9 and 13 | [ ] |
| 14 | Secure: RLS, private storage, no service-role key in the browser | Section 11 | [ ] |
| 15 | Works on phones, tablets and desktops, including iOS 18 | Section 14 | [ ] |
| 16 | Toast notifications, floating action buttons and skeleton screens | Section 15 | [ ] |
| 17 | Built phase by phase with Claude Code, tested before moving on | Section 17 | [ ] |

## 2. System overview

```
   Learner        Lecturer        Administrator      (phone, tablet or desktop browser)
      \              |               /
       +-------------+--------------+
                     | HTTPS
                     v
 +------------------------------------------------------------------------------+
 | FRONTEND on Vercel: React + Vite, Tailwind, shadcn/ui, React Router          |
 | Route guards | skeletons | toasts | FABs | responsive layouts | PWA shell     |
 +------------------------------------------------------------------------------+
    |sign in/up      |data (user JWT)     |files (user JWT)       |trusted calls
    v                v                    v                       v
 +----------+  +--------------+  +-----------------+  +------------------------+
 | Supabase |  | PostgreSQL   |  | Supabase        |  | Edge Functions         |
 | Auth     |  | with RLS,    |  | Storage         |  | (the service-role key  |
 | email +  |  | triggers and |  | private buckets |  | lives only here)       |
 | password |  | functions    |  | + policies      |  |                        |
 +----------+  +--------------+  +-----------------+  +------------------------+
                     ^   ^                ^                      |
                     |   +---- pg_cron scheduled jobs -----------+
 Also: Resend (email) | Sentry (errors) | Turnstile (CAPTCHA) | GitHub Actions (CI)
```

How to read it: the browser talks to Supabase directly for sign-in, data and files, using the signed-in user's own session, so every request is checked by database and storage rules. Anything that needs extra power (creating users, validating uploads, releasing grades, deleting files) goes through an Edge Function, which re-checks the caller before acting.

## 3. Technology

| Layer | Choice |
|---|---|
| Frontend | React, Vite, JavaScript with JSDoc type checks and Zod validation, Tailwind CSS, shadcn/ui, Lucide React, React Router, Supabase JavaScript client |
| Backend | Supabase: Auth, PostgreSQL with Row Level Security, Storage, Edge Functions (TypeScript), `pg_cron` |
| Email, bots, errors | Resend (SMTP), Cloudflare Turnstile, Sentry |
| Hosting and delivery | Vercel for the frontend; three Supabase projects (development, staging, production); GitHub Actions CI |
| Testing | Vitest, React Testing Library, Playwright (10 device profiles), pgTAP for database rules, Lighthouse CI |
| Not used | Express, MongoDB, Firebase, Apple sign-in and other social sign-in (Google is the only one) |

## 4. Roles

| Role | How the account is created | Can do |
|---|---|---|
| Administrator | One-time bootstrap script; at least two before launch; MFA required | Manage users and roles, provision lecturers, create and approve courses, enrol learners, view all gradebooks and reports, read audit logs, change settings |
| Lecturer | Provisioned by an administrator; may create courses only if given `can_create_courses` | Teach assigned courses: lessons, audio, attachments, assignments, grading, gradebook, charts, exports |
| Learner | Self sign-up by email or with Continue with Google, or imported by an administrator | Study enrolled courses, play and download lesson audio, submit assignments, see own released grades and feedback |

A lecturer sees only courses they are assigned to. A learner sees only their own marks and feedback, and class charts only when at least 5 results are graded and released.

## 5. Sign-in, sign-up and routes

**Sign-up:** the email form asks for first name, second name, email and password. A database trigger creates a Learner profile; the browser can never choose the role. The learner must verify their email before signing in. **Continue with Google** (learners only) appears on Sign In and Sign Up: a new Google account becomes a Learner with its names copied from Google (a Complete your profile screen appears if a name is missing); a Google email that belongs to an administrator or lecturer is refused; a Google email that matches an existing verified learner links to that learner.

**Sign-in:**
1. The app opens and checks the session while a skeleton is shown (no flash of Sign In or protected content).
2. No session: show Sign In (email and password, and Continue with Google below an "or" divider). Directly below the form show the gölarae logo and, directly beneath it, the text "from gölarae". The same block sits directly below the Sign Up form.
3. Supabase Auth validates email and password (CAPTCHA applies).
4. The app loads the profile and role, then checks account status. Suspended or deactivated users are refused with a clear message.
5. Administrators must complete MFA (TOTP) before any admin page or data opens.
6. The user is sent to their dashboard.

| Route | Who | What |
|---|---|---|
| `/` | Everyone | Sign In when signed out; the user's dashboard when signed in |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Signed-out users | Authentication pages; signed-in users are redirected to their dashboard |
| `/admin/dashboard` and sub-pages | Administrator | Protected |
| `/lecturer/dashboard` and sub-pages | Lecturer | Protected |
| `/learner/dashboard` and sub-pages | Learner | Protected |

Route guards only decide what the screen shows. The real protection is in the database and storage rules (Section 11).

**Preview routes (Phase 1 to Phase 3).** Until sign-in exists, the role layout shells are reachable only on preview routes: `/dev` (index), `/dev/design` (every shared component) and `/dev/shell/{admin|lecturer|learner}/{page}`. They are compiled in only when `VITE_DEV_ROUTES` is true: the dev server, the end-to-end build (`dist-e2e/`) and Vercel preview deployments. Production builds drop them, so production has only `/`, `/offline` and the 404 page. Phase 3 mounts the same shells under the guarded routes above.

**Frontend structure (Phase 1).** `src/styles/tokens.css` (design tokens, light and dark) and `src/styles/index.css` (Tailwind 4 `@theme` mapping); `src/components/ui` (shadcn/ui primitives restyled with tokens); `src/components/brand` (`LogoMark`, `BrandBlock`, `GoogleButton`); `src/components/feedback` (toasts, skeletons, FAB and speed dial, states, offline and update prompts, in-app-browser notice); `src/components/layout` (`AppShell`, `PhoneNav`, `SideNav`, account menu, theme switch); `src/components/data` (`ResponsiveTable`, `ResponsiveChart`); `src/lib/toast` (the toast catalogue and controller; only catalogue toasts can be shown); `src/lib/supabase.js` (anon key only, checked by `src/lib/env.js`). The service worker (`pwa.config.js`) precaches the app shell only and has no runtime caching.

## 6. Navigation and avatars

| Role | Phone (bottom tab bar) | Tablet and desktop |
|---|---|---|
| Administrator | Dashboard, Users, Courses + More | Sidebar: Dashboard, Users, Lecturers, Learners, Courses, Approvals, Enrolments, Assignments, Gradebooks, Reports, Notifications, Audit logs, Settings |
| Lecturer | Dashboard, My Courses, To grade + More | Sidebar: Dashboard, My Courses, To grade (submissions to review), Gradebooks, Notifications |
| Learner | Dashboard, My Courses, Assignments + More | Sidebar: Dashboard, My Courses, Assignments, Grades, Notifications |

Profile settings, the theme choice and Sign out are in the avatar menu in the top bar (and Profile and Sign out also in the phone More sheet). The single source of these lists is `src/lib/navigation.js` (Phase 1). Course-scoped pages (lessons, grading, results, learner progress) live inside the course workspace, not in global navigation.

Tablets use a collapsible side rail. On phones the floating pill shows only icons for the three main destinations and a permanent More button; the name appears on the active item only, with an animated morph (D40). More opens a sheet with every other page and Sign out.

**Avatar logic (`UserAvatar.jsx`, used everywhere a person appears):** show the uploaded picture; if there is none or it fails to load, show initials (first letter of first name plus first letter of second name, uppercase, for example Prince Boateng gives PB); if only one name, one letter; if no name, a generic icon. Initials are calculated, never stored.

## 7. How the content is organised

```
 Course
  |-- Lecturers (OWNER, CO_LECTURER)
  |-- Enrolled learners (administrator enrols)
  |-- Lessons (ordered; nothing between a course and its lessons)
  |     |-- written content
  |     |-- audio files (one active, older ones kept as history)
  |     |-- attachments (PDF, DOCX, PPTX)
  |-- Grade categories (weights total 100)
  |-- Assignments (can be linked to a lesson)
  |     |-- instructions: text, audio, or both
  |     |-- Submissions (one per learner, many versions)
  |           |-- files, score, feedback, release state, grade history
  |-- Gradebook and charts (calculated when viewed)
```

There are no terms and no modules. A course is a standing workspace; it has no start or end date. A learner's time in a course is their enrolment (ACTIVE, COMPLETED, WITHDRAWN or SUSPENDED). Archiving a course keeps everything and makes it read-only for learners.

**Course workspace tabs:** Overview, Lessons, Assignments, Learners, Gradebook, Analytics, Settings.

## 8. Main data (summary)

Full columns and constraints are in BUILD_PLAN Section 5. Every table has Row Level Security on.

| Group | Tables |
|---|---|
| People | `profiles` (role, status, names, avatar file), `notification_preferences` |
| Courses | `courses`, `course_lecturers`, `course_enrollments`, `grade_categories` |
| Lessons | `lessons`, `lesson_audio_files`, `lesson_attachments`, `lesson_progress` |
| Assessment | `assignments`, `assignment_versions`, `submission_extensions`, `submissions`, `submission_versions`, `submission_files`, `grade_change_history` |
| Files | `file_objects` (one row for every uploaded file, with its validation status) |
| Communication | `notifications`, `notification_deliveries` |
| Control | `system_settings`, `audit_logs`, `retention_holds`, `retention_runs` |

Rules that matter: educational records are never hard-deleted (foreign keys restrict deletion; courses are archived and users deactivated); one active enrolment per learner and course; lesson order is unique per course; one active audio file per lesson; scores must be between 0 and the assignment maximum; the audit log and grade history cannot be edited.

## 9. How the main workflows run

**Course lifecycle.** A lecturer (with permission) or administrator creates a course in DRAFT. If approval is on (the default), the lecturer submits it (PENDING_APPROVAL) and an administrator approves it (PUBLISHED) or returns it with a reason (back to DRAFT). Courses can be ARCHIVED. Draft and pending courses are invisible to learners.

**Enrolment.** Only administrators enrol learners, one at a time or by CSV. Only ACTIVE (full access) and COMPLETED (read-only) enrolments give access. There is no self-enrolment.

**Lessons and lesson audio.**
1. The lecturer creates a lesson, writes content, saves drafts, reorders, then publishes.
2. Audio goes through the upload pipeline (Section 10) and becomes the lesson's active audio; replacing it keeps the old file as history.
3. An enrolled learner opens the lesson, reads, streams the audio in the lesson page, downloads it for offline listening, and marks the lesson complete. Progress is shown per course.

**Assignments.** A lecturer creates an assignment with title, description, due date, maximum marks, accepted formats, grading criteria and category. Instructions are text, audio or both (the database checks the right parts exist). It becomes visible to learners when published.

**Submissions.**
1. The learner chooses a response type: text, recorded audio (browser microphone, with preview), uploaded audio, PDF or Word.
2. Files are validated on the server (Section 10). The server decides lateness from its own clock.
3. A learner may resubmit until the due date and until the work is graded. After the due date it is blocked unless the assignment allows late work or the lecturer granted an extension. Each submission is a new version; older versions are kept.

**Grading and release.**
1. The lecturer opens a submission, reads or plays it, enters a score and feedback, and saves a draft.
2. Release publishes the grade to the learner (one submission or a whole assignment) and sends a notification.
3. Changing a grade later is recorded in grade history with who, when, old and new values.
4. A lecturer can reopen a graded submission; this is audited.
5. The results dashboard lists every enrolled learner, including those who never submitted.

## 10. Files and storage

Every file, whatever its type, follows the same three steps:

```
 Browser                Edge Function            Database               Storage
    | 1 register-upload ->|                         |                       |
    |                     |-- check permission ---->|                       |
    |<-- path + file id --|<-- PENDING row created -|                       |
    | 2 upload to exact path (resumable if over 25 MB) --------------------->|
    | 3 finalize-upload ->|                         |                       |
    |                     |-- read object; check type, size, duration, rules |
    |                     |-- mark VALIDATED, or REJECTED and remove object  |
    |<-- result ----------|                         |                       |
    | 4 later: createSignedUrl with own session (policy requires VALIDATED) ->|
```

Only VALIDATED files can be played or downloaded. Pending uploads older than 24 hours are cleaned up. Signed links last 1 hour for playback and 5 minutes for download.

| Bucket | Holds | Written by | Read by |
|---|---|---|---|
| `lesson-audio` | Lecturer lesson audio | Course lecturers | Course lecturers, enrolled learners (published lessons), administrators |
| `lesson-attachments` | Lesson PDFs, Word, PowerPoint | Course lecturers | Same as lesson audio |
| `assignment-instructions-audio` | Lecturer assignment audio | Course lecturers | Course lecturers, enrolled learners (published assignments), administrators |
| `learner-submissions` | Learner audio, PDF, Word | The learner | The learner, that course's lecturers, administrators |
| `profile-images` | Avatars | The owner | Signed-in users |
| `course-covers` | Cover images | Course lecturers | Users who can see the course |

Limits (adjustable settings): lesson audio 100 MB and 90 minutes; learner audio 25 MB and 10 minutes; PDF and Word 10 MB; images 2 MB. Lesson audio, instruction audio and learner audio are in separate buckets, so deleting one kind can never touch another.

## 11. Security

```
 Request -> 1 Route guard (screen only)  -> 2 Supabase Auth session (JWT; MFA for admins)
         -> 3 Row Level Security on every table -> 4 Storage policies (check file status)
         -> 5 Edge Functions re-check role, ownership and rules before acting
         -> 6 Audit log of important actions
```

- Roles are stored in the database and cannot be changed from the browser; only an administrator, through an audited function, can change a role or a lecturer's course-creation permission.
- The service-role key exists only inside Edge Functions and server settings. Continuous checks fail the build if it appears in frontend code.
- Sessions: administrators 30 minutes idle and 12 hours maximum; lecturers 8 hours idle and 7 days maximum; learners 7 days idle and 30 days maximum. Suspension revokes all sessions.
- Google sign-in accepts verified Google emails only, never signs in or links an administrator or lecturer account, and does not import the Google photo. Email sign-in and sign-up use CAPTCHA and rate limits; error messages never reveal whether an email is registered.
- Administrators use MFA, and a lost device is reset by the other administrator through an audited function.
- Learners cannot see another learner's submissions, marks or feedback; unreleased grades stay private.
- Audit records are written for administrator actions, permission changes, grade changes, exports, settings changes and file deletions, and cannot be edited.

## 12. Grades, gradebook and charts

Nothing is stored as a total. One database function, `calculate_course_grades`, works out every percentage, overall grade, band and chart count whenever a screen or export needs it, so figures always match the latest grades.

**What counts for a learner:** a graded and released assignment counts, even if it was handed in early; a missing assignment counts as 0 only if the course setting `missing_as_zero` is on and the due date (or the learner's extension) has passed. Ungraded work, drafts and future work with no released grade are left out. A late submission lifts a counted zero until its grade is released.

**Worked example.** Categories: Assignments weight 70, Practical weight 30.
- Assignments: 18 out of 20 and 40 out of 50 give 58 out of 70, which is 82.9%.
- Practical: 26 out of 40 gives 65.0%.
- Overall = (82.9 x 70 + 65.0 x 30) / 100 = 77.5%, grade B. It shows "Provisional" until every published assignment is graded or past its due date, then "Final".

**Default bands:** A 80 to 100, B 70 to 79, C 60 to 69, D 50 to 59, F below 50; pass mark 50. A score of 73 out of 100 is 73% and sits in the 70 to 79 band.

**Score distribution chart** (one per graded assignment): horizontal axis "Percentage scored", vertical axis "Number of learners", the count printed on each bar, the learner's own band highlighted in their view, and a text summary for screen readers. The ranges are 0 to 49, 50 to 59, 60 to 69, 70 to 79, 80 to 89 and 90 to 100, and the administrator can change them. A band is not a rank. Learners see the chart only when at least 5 results are graded and released.

**Gradebook:** one per course. Lecturers see all learners of their courses with score, maximum, percentage, status and overall grade; learners see only their own row; administrators see all. Exports (CSV, Excel) are limited to authorised roles and audited.

## 13. Background jobs

| Job | Runs | Purpose |
|---|---|---|
| `send-notification-email` | every minute | Sends queued emails; retries up to 5 times (1, 5, 15, 60, 240 minutes) |
| `schedule-reminders` | every 15 minutes | Creates one due-date reminder 24 hours before the due date, once per learner and assignment |
| `cleanup-files` | hourly | Removes expired pending uploads, rejected files and replaced avatars or covers; never touches lesson audio, instruction audio, attachments or validated submissions |
| `retention-runner` | daily | Deletes eligible learner assignment audio only (graded and released, at least 180 days old, no hold). Off at launch; dry run for the first 30 days; only an administrator can switch it on |

Retention never deletes: lesson audio, instruction audio, attachments, text answers, PDFs, Word files, or anything under a hold. The submission, grade, feedback and history always stay.

Notifications: in-app and email for grade released, assignment published, due date in 24 hours, enrolment added, and course approved or returned. Users may turn off non-account emails.

## 14. Responsive design

Mobile-first from 320 px wide. Phone: one column, bottom tab bar, cards instead of tables, full-screen sheets. Tablet: collapsible side rail. Desktop: sidebar, full tables, two-pane grading. No horizontal page scrolling at any width; tap targets at least 44 px; inputs 16 px so iPhone does not zoom; the on-screen keyboard never covers the focused field; iPhone notch and home bar are respected. The audio player has touch seeking, speed control and lock-screen controls. Links opened inside WhatsApp or Facebook show a notice to open in Safari or Chrome. Supported: iOS 17 and later, and the last two versions of the main browsers. Automated tests cover 10 device profiles, and a real-device check (an iPhone on iOS 18 and iOS 17, an iPad, an Android phone, laptops) is required before launch. Performance targets and the per-screen checklist are in BUILD_PLAN Section 15.

## 15. Interface feedback: toasts, floating action buttons and skeleton screens

This is the complete list. Anything not listed here does not exist without a written decision.

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
| Administrator, Users | Speed dial: Add learner, Provision lecturer, Import CSV | Administrator |
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


## 16. Environments, deployment and recovery

- Three environments: development, staging, production, each with its own Supabase project. Real learner data is never used in development or staging.
- Every change goes through a pull request; CI runs lint, type checks, unit tests, database rule tests, Playwright and Lighthouse before it can merge.
- Database changes are numbered migrations only; nothing is changed by hand in the dashboard.
- Production: HTTPS, custom email domain, secrets in server settings, Sentry monitoring, uptime alerts.
- Backups: daily database backup and daily file backup, kept 30 days; recovery targets 24 hours of data loss at most and 8 hours to restore; a restore drill is run before launch and every quarter.

## 17. Build phases

| Phase | What is built | Tag |
|---|---|---|
| 0 | Repository, environments, CI | `phase-0-done` |
| 1 | Frontend scaffold, design system, responsive foundation, toasts, FABs, skeletons, `UserAvatar` | `phase-1-done` |
| 2 | Database foundation, helper functions, audit log, security tests | `phase-2-done` |
| 3 | Authentication (email and password for all roles; Continue with Google for learners, D27) | `phase-3-done` |
| 4 | Profiles, user management, avatars, admin tools | `phase-4-done` |
| 5 | Courses, lecturers, enrolment | `phase-5-done` |
| 6 | Lessons and lesson audio | `phase-6-done` |
| 7 | Assignments and instruction audio | `phase-7-done` |
| 8 | Submissions and file validation | `phase-8-done` |
| 9 | Grading, feedback, grade history | `phase-9-done` |
| 10 | Gradebook, weights, distribution charts, exports | `phase-10-done` |
| 11 | Notifications, reports, audit viewer, settings | `phase-11-done` |
| 12 | Learner-audio retention | `phase-12-done` |
| 13 | Hardening, accessibility, performance, recovery drill | `phase-13-done` |
| 14 | Staging acceptance and production release | `v1.0.0` |

Each phase ends only when its tests and exit gate pass. Claude Code is told to build one phase per session and to stop and ask rather than invent policy.

## 18. What DDTC still has to supply

Domain and sender email; logo and brand colours; first administrator email; production Supabase owner; privacy notice and terms; support contact; a privacy owner; approved retention schedules; approval of backup targets; two named administrators with a recovery procedure. Each is listed with the phase that needs it in BUILD_PLAN Section 4.

## 19. Brand, logos and design system

- Official DDTC LMS logo: the circle emblem (`assets/brand/logo-ddtc-*.png`). It appears above the Sign In and Sign Up forms and in the sidebar, rendered navy on light surfaces and white on dark.
- Logo of gölarae: `assets/brand/logo-golarae*.png`, centred directly below the form with the text "from gölarae" directly beneath it.
- Palette: primary #2563EB, navy #0F172A, slate #64748B, surface #F1F5F9, success #0F766E, warning #D97706, error #DC2626, with a separately defined dark theme. Font: Inter on all devices. Icons: Lucide. Themes: Light, Dark, System (stored in the browser).
- The visual reference is the clickable prototype in `docs/prototype/`. Full rules are in `docs/DESIGN.md`.

## 20. Document map

| File | Use |
|---|---|
| `CLAUDE.md` | Working rules and phase protocol for Claude Code |
| `docs/BUILD_PLAN.md` | Master specification, decisions D01 to D40, phases, acceptance journey |
| `docs/DECISIONS.md` | Locked decisions, ADR log and the decisions you still have to make |
| `docs/ARCHITECTURE.md` | This document |
| `docs/DATA_MODEL.md` | Tables, constraints and storage buckets |
| `docs/SECURITY_AND_ACCESS.md` | Permission matrix, Edge Functions, upload pipeline and sign-in rules |
| `docs/DESIGN.md` | Colours, type, components, logos, Google button |
| `docs/RESPONSIVE.md` and `docs/UI_FEEDBACK.md` | Device standard; toasts, floating buttons, skeleton screens |
| `docs/PHASES.md` and `docs/phases/` | The 15 build phases and their gates |
| `docs/TESTING.md` | How every phase is tested before moving on |
| `docs/ACCEPTANCE.md`, `docs/RUNBOOK.md`, `docs/INPUTS.md` | Acceptance journey, operations, what DDTC must supply |
| `docs/prototype/` | Clickable prototype with trial logins |
| `docs/architecture/` | Version-controlled Mermaid diagrams (see Section 21) |

## 21. Diagrams (Mermaid source, BUILD_PLAN Section 9)

| Diagram | File |
|---|---|
| 1. System and context architecture, environments | [`architecture/01-system-context.md`](architecture/01-system-context.md) |
| 2. Role and permission map, enforcement layer per rule | [`architecture/02-role-permission-map.md`](architecture/02-role-permission-map.md) |
| 3. Database ERD | [`architecture/03-database-erd.md`](architecture/03-database-erd.md) |
| 4a. Course lifecycle and approval | [`architecture/04a-course-approval.md`](architecture/04a-course-approval.md) |
| 4b. Upload pipeline and file access | [`architecture/04b-upload-pipeline.md`](architecture/04b-upload-pipeline.md) |
| 4c. Assignment submission | [`architecture/04c-assignment-submission.md`](architecture/04c-assignment-submission.md) |
| 4d. Grading, release and recalculation | [`architecture/04d-grade-release-recalculation.md`](architecture/04d-grade-release-recalculation.md) |
| 4e. Learner-audio retention | [`architecture/04e-retention.md`](architecture/04e-retention.md) |

Diagrams are updated in the same pull request as any change to the structure they show.
