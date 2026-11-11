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
 Also: Resend (email) | Sentry (errors) | GitHub Actions (CI)
```

How to read it: the browser talks to Supabase directly for sign-in, data and files, using the signed-in user's own session, so every request is checked by database and storage rules. Anything that needs extra power (creating users, validating uploads, releasing grades, deleting files) goes through an Edge Function, which re-checks the caller before acting.

## 3. Technology

| Layer | Choice |
|---|---|
| Frontend | React, Vite, JavaScript with JSDoc type checks and Zod validation, Tailwind CSS, shadcn/ui, Lucide React, React Router, Supabase JavaScript client |
| Backend | Supabase: Auth, PostgreSQL with Row Level Security, Storage, Edge Functions (TypeScript), `pg_cron` |
| Email, errors | Resend (SMTP), Sentry (no CAPTCHA: owner change to D22, 2026-11-05) |
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
3. Supabase Auth validates email and password (per-IP rate limits apply; no CAPTCHA since 2026-11-05).
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
| People | `profiles` (role, status, names, avatar file, six-digit ID number, a learner's branch), `branches`, `notification_preferences` |
| Courses | `courses`, `course_lecturers`, `course_enrollments`, `grade_categories` |
| Lessons | `lessons`, `lesson_audio_files`, `lesson_attachments`, `lesson_progress` |
| Assessment | `assignments`, `assignment_versions`, `submission_extensions`, `submissions`, `submission_versions`, `submission_files`, `grade_change_history` |
| Files | `file_objects` (one row for every uploaded file, with its validation status) |
| Communication | `notifications`, `notification_deliveries` |
| Control | `system_settings`, `audit_logs`, `retention_holds`, `retention_runs` |

Rules that matter: educational records are never hard-deleted (foreign keys restrict deletion; courses are archived and users deactivated); one active enrolment per learner and course; lesson order is unique per course; up to 10 active audio files per lesson (ADR-007); category weights total 100 before grades are released; scores must be between 0 and the assignment maximum; the audit log and grade history cannot be edited.

## 9. How the main workflows run

**Course lifecycle.** A lecturer (with permission) or administrator creates a course in DRAFT. If approval is on (the default), the lecturer submits it (PENDING_APPROVAL) and an administrator approves it (PUBLISHED) or returns it with a reason (back to DRAFT). Courses can be ARCHIVED. Draft and pending courses are invisible to learners.

**Enrolment.** Only administrators enrol learners, one at a time or by CSV. Only ACTIVE (full access) and COMPLETED (read-only) enrolments give access. There is no self-enrolment.

**Lessons and lesson audio.**
1. The lecturer creates a lesson, writes content, saves drafts, reorders, then publishes.
2. Audio goes through the upload pipeline (Section 10) and becomes the lesson's active audio; replacing it keeps the old file as history.
3. An enrolled learner opens the lesson, reads, streams the audio in the lesson page, downloads it for offline listening, and marks the lesson complete. Progress is shown per course.

**Assignments.** A lecturer creates an assignment with title, description, due date, maximum marks, accepted formats (text and audio always, PDF and Word optional, ADR-009), grading criteria and category. Instructions are text, audio or both (the database checks the right parts exist). It becomes visible to learners when published; every change to a published assignment is kept as a version with the reason, and assignments are archived, never deleted.

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
| `learner-submissions` | Learner audio (uploaded or recorded), PDF, Word | The learner | The learner; that course's lecturers and AAL2 administrators, for submitted versions only |
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
- Google sign-in accepts verified Google emails only, never signs in or links an administrator or lecturer account, and does not import the Google photo. Email sign-in and sign-up use rate limits (CAPTCHA removed by the owner, 2026-11-05); error messages never reveal whether an email is registered.
- Administrators use MFA, and a lost device is reset by the other administrator through an audited function.
- Learners cannot see another learner's submissions, marks or feedback; unreleased grades stay private.
- Audit records are written for administrator actions, permission changes, grade changes, exports, settings changes and file deletions, and cannot be edited.

### Database security as built (Phase 2)

- **No default access.** Migration 1 removes Supabase's default grants to `anon` and `authenticated` for new tables, sequences and functions. Each table grants exactly what its policies need; `anon` has nothing in `public` (a standing pgTAP guard checks this, and that no client role can DELETE or TRUNCATE).
- **Helpers** live in a `private` schema that the Data API does not expose: `is_active_user()`, `is_admin()` (role ADMIN, ACTIVE **and** an `aal2` session), `is_active_lecturer()`, `is_trusted_session()`, `write_audit()`. All are `SECURITY DEFINER` where they read `profiles`, each with `search_path = ''` (standing guard). `is_lecturer_of` and `is_enrolled` arrive with their tables in Phase 5 (owner decision, 2026-11-05).
- **Column protection, two layers.** Column-level UPDATE grants let a signed-in user change only `first_name`, `second_name`, `contact_number` and `profile_image_file_id` on their own row while ACTIVE. The `profiles_guard` trigger also blocks role, status, `can_create_courses`, email and id changes from any client session (administrators included: those go through `set-user-role` with the service role), forbids blanking a name, requires the profile image to be the user's own VALIDATED `PROFILE_IMAGE` file, and derives `profile_completed`.
- **Sign-up.** `on_auth_user_created` makes every new user LEARNER and ACTIVE; client metadata supplies names only. Email sign-up without both names is rejected (the auth user is not created); Google sign-up uses `given_name` and `family_name` and sets `profile_completed = false` when either is missing. Administrators and lecturers are promoted afterwards by trusted functions.
- **Audit log** is append-only for every role including the owner (UPDATE, DELETE and TRUNCATE triggers), readable by AAL2 administrators. Triggers record role, status, course-creation and setting changes with old and new values.
- **Settings** keep their JSON type; keys are added only by migrations; lecturers read rows not marked `is_sensitive`.
- Local seed: `admin@ddtc.test`, `lecturer1@ddtc.test` (can create courses), `lecturer2@ddtc.test`, `learner1..3@ddtc.test`, password `DdtcLocal-2026` (local and CI only).

### User management as built (Phase 4)

- **Edge Functions** (service role inside the function only; each re-checks the caller is an ACTIVE administrator with an AAL2 session before acting): `set-user-role` (role, status, course creation; never on oneself), `provision-lecturer`, `provision-admin` (invite by email, ADR-003), `bulk-import-learners` (preview, then commit with an error report), `reset-admin-mfa` (3 per hour per administrator), and the D18 upload pair `register-upload` and `finalize-upload`. `cleanup-files` runs hourly from `pg_cron` and removes replaced and rejected objects.
- **Trusted database functions** called only by those Edge Functions: `admin_set_user`, `admin_record_mfa_reset`, `bootstrap_first_admin` (one-time; sets `bootstrap_completed`), `launch_readiness()` (refuses launch below two active administrators who have accepted their invitation). Each writes an `audit_logs` row with the acting administrator.
- **Sessions (D32):** suspension and deactivation revoke every session; administrator idle and absolute limits are enforced on the server, lecturer and learner limits in the client (`SessionWatcher`).
- **Bootstrap:** `scripts/bootstrap-admin.mjs`, run once per environment by the owner (`docs/RUNBOOK.md`).

### Courses and enrolment as built (Phase 5)

- **Tables:** `courses` (lifecycle DRAFT, PENDING_APPROVAL, PUBLISHED, ARCHIVED; unique capitalised `course_code`; `courses_guard` keeps status and lifecycle columns for trusted paths and makes ARCHIVED read-only), `course_lecturers` (OWNER or CO_LECTURER; removal sets `removed_at`, the row is kept), `course_enrollments` (ACTIVE, COMPLETED, WITHDRAWN, SUSPENDED; one current enrolment per learner and course; WITHDRAWN rows are history). `profiles.can_publish_directly` (ADR-005).
- **Helpers:** `private.is_lecturer_of`, `private.is_enrolled` (ACTIVE or COMPLETED: read access), `private.is_actively_enrolled` (ACTIVE in a PUBLISHED course: the only state in which learners may write in later phases), `private.can_see_course`. Learners see PUBLISHED and ARCHIVED courses they are enrolled in; lecturers their own courses; AAL2 administrators everything.
- **Names without personal data:** `course_roster()` (learners of a course, name and photo only, for its lecturers and administrators), `course_teachers()` (lecturers of a course, for anyone who may see it) and `course_cover_paths()`.
- **Trusted functions and Edge Functions:** `create-course` (`course_create`), `course-lifecycle` (`course_transition`), `course-lecturers` (`course_lecturer_change`; lecturers name a colleague by email), `manage-enrolments` (`enrolment_add`, `enrolment_set_status`), `set-user-role` (`admin_set_direct_publish`). The Edge Function passes `p_as_admin` only after `am_i_admin()` succeeds with the caller's token. `admin_set_user` refuses to take a lecturer who owns a course that is not archived out of teaching until ownership is transferred.
- **Covers:** private `course-covers` bucket, path `<course id>/<file id>.<ext>`, through `register-upload` and `finalize-upload`; replaced covers are removed and `cleanup-files` retries.
- **Routes:** `/:role/courses/new`, `/:role/courses/:courseId/:tab?` (administrator and lecturer workspace), `/learner/courses/:courseId`.

### Lessons and lesson audio as built (Phase 6)

- **Tables:** `lessons` (ordered by a unique, deferrable position; DRAFT or PUBLISHED; content is HTML cleaned by `manage-lessons` and checked again by the table), `lesson_audio_files` (up to 10 ACTIVE per lesson, each with a title and a distinct position 1 to 10; replacing marks the old one SUPERSEDED in the same place; deleting marks it DELETED with who and when, ADR-007), `lesson_attachments` (deleting sets `removed_at` and `removed_by`), `lesson_progress` (one row per learner and lesson). `file_objects.waveform_peaks` holds 128 values from 0 to 1 (ADR-006).
- **Access:** `private.can_manage_lesson` (AAL2 administrators and the course's active lecturers) and `private.can_see_lesson` (managers, and learners enrolled ACTIVE or COMPLETED once the lesson is PUBLISHED in a PUBLISHED or ARCHIVED course). `lesson_media()` returns the ACTIVE audio files in order and the attachments with their paths, sizes, duration and peaks for whoever may see the lesson. `mark_lesson()` records progress only for an ACTIVE enrolment in a PUBLISHED course (D05, D07).
- **Storage:** private `lesson-audio` (100 MB; `audio/mpeg`, `audio/mp4`, `audio/wav`) and `lesson-attachments` (25 MB; PDF, DOCX, PPTX), path `<course id>/<lesson id>/<file id>.<ext>`. Reads require a VALIDATED file and `private.can_read_lesson_object` (managers read every validated file of their lessons, history included; learners only the ACTIVE audio and attachments not deleted; a deleted item's file is readable by nobody, even before Storage removes it). Nobody writes or deletes directly.
- **Pipeline:** `register-upload` checks the course right and the lesson's course; the browser uploads (resumable tus over 25 MB) and computes the waveform peaks while it uploads; `finalize-upload` reads only the ranges it needs to find the real type and the duration (`_shared/audio.ts`, `_shared/documents.ts`), requires the name to match the content, checks D17 limits from `system_settings.file_limits`, stores the peaks, then calls `lesson_audio_activate` or `lesson_attachment_add`.
- **Trusted functions:** `lesson_save`, `lesson_set_publication`, `lesson_reorder` (the whole course in one transaction), `lesson_audio_activate` (adds at the end, at most 10, or replaces a named audio), `lesson_audio_rename`, `lesson_audio_reorder`, `lesson_attachment_add`, behind `manage-lessons` and `finalize-upload`; `lesson_audio_delete`, `lesson_attachment_delete` and `course_cover_remove` behind `delete-media`; archived courses are refused; everything is audited.
- **Deleting (ADR-007):** `delete-media` calls the database function first (the item leaves the lesson or course, its record stays), then removes the file from Storage (`_shared/remove-file.ts`) and marks it DELETED, or DELETE_FAILED for `cleanup-files`, whose `files_due_for_cleanup` also lists deleted items' files still in Storage. In the browser, `useMediaDelete` with `ConfirmDeleteDialog` (on the new `alert-dialog` component) runs every delete: confirm, a loading state, the change only after the server confirms, then the success toast, or an error toast with Try again and the item left in place.
- **Player:** `AudioPlayer` and `Waveform` (ADR-006); starting one player pauses any other on the page, and seeks stop 0.1 s short of the end (Firefox and Linux WebKit break when told to seek exactly to the end) with signed URLs from the user's own session (one hour for playback, five minutes for downloads, D19); `/dev/audio` shows every size and state in preview builds.
- **Routes:** `/:role/courses/:courseId/lessons/:lessonId` (`new` for a new lesson) for lecturers and administrators; `/learner/courses/:courseId/lessons/:lessonId` for learners.

### Account ID numbers as built (step 6.1, ADR-008)

- **Column:** `profiles.id_number`, integer, unique, 100000 to 999999. A BEFORE INSERT trigger (`private.assign_id_number`) takes the next value of `private.id_number_seq` (1 to 900000, no cycle) and passes it through `private.id_number_for()`, a fixed one-to-one shuffle (multiply by 556231, which shares no factor with 900000, add an offset, wrap): every account gets a different number, neighbours land far apart, and the numbers say nothing about joining order or how many accounts exist. Beyond 900,000 accounts it refuses. Existing accounts were numbered in joining order by the migration (without touching `updated_at`).
- **Never changes:** `private.keep_id_number` refuses any change for every role, the server included; clients have no update grant on the column; accounts are never deleted, so a number is never reused.
- **Who sees it:** the person and administrators through the existing profile rules; the lecturers of a learner's courses through `course_roster` (which now returns `id_number`, still never email or phone). Admin searches (Users list, Enrol learners picker) match a typed six-digit number as well as names and email (`userSearchFilter`); the CSV import returns each new learner's number in its results and report.

### Assignments and instruction audio as built (Phase 7)

- **Tables:** `grade_categories` (name unique per course among current categories, whole-number weight 0 to 100, position; every new course gets Assignments at 100 from the `courses_add_default_category` trigger; `course_weight_total()` gives the running total, and `private.require_weights_total_100()` refuses unless the current weights total exactly 100, D12, for Phase 9's release functions to call first), `assignments` (content type TEXT, AUDIO or TEXT_AND_AUDIO; due date and time, late answers allowed or not, maximum marks, grading criteria; instruction HTML cleaned by `manage-assignments` against the lesson allow-list and checked again by the table; `accepted_formats` always holds TEXT and AUDIO, PDF and Word optional, ADR-009; archived with `archived_at`, never deleted), `assignment_versions` (D29 snapshots, numbered per assignment, with who changed it and the reason), `submission_extensions` (one per assignment and learner; `private.effective_due_at()` gives the learner's extension or the due date, D13; granting is Phase 8).
- **Database rules:** the CHECK `assignments_instructions_match_type` lets an assignment be PUBLISHED only with what its type needs (text with visible words, the audio, or both); a draft may wait for its audio, uploaded once the draft exists. `assignments_guard` keeps the category, the lesson and the instruction audio inside the assignment's course (the audio must be a VALIDATED instruction file of this assignment), and a course never changes.
- **Access:** `private.can_manage_course` (AAL2 administrators and the course's active lecturers) and `private.can_see_assignment` (managers, and learners enrolled ACTIVE or COMPLETED once the assignment is PUBLISHED and not archived). Clients only read: categories for whoever may see the course, versions for managers, extensions for the learner they belong to and for managers. `assignment_media()` returns the current instruction audio for whoever may see the assignment.
- **Storage:** private `assignment-instructions-audio` (25 MB and 10 minutes; `audio/mpeg`, `audio/mp4`, `audio/wav`), path `<course id>/<assignment id>/<file id>.<ext>`, on the same `register-upload` and `finalize-upload` checks as lesson audio. Reads require a VALIDATED file and `private.can_read_instruction_object` (managers read every instruction file of their assignments, replaced ones included; learners only the current audio of a published assignment). Nobody writes or deletes directly.
- **Trusted functions:** `grade_categories_save`, `assignment_save`, `assignment_set_publication`, `assignment_set_archived` behind `manage-assignments` (actions save, publish, archive and save-categories; publish and archive also undo), and `assignment_audio_activate` behind `finalize-upload`. Each re-checks the actor and the course (archived courses are read-only), snapshots a published assignment on publish and on every change (`private.snapshot_assignment`, with the reason), audits deadline changes, and writes its audit record in the same transaction.
- **Routes:** `/:role/courses/:courseId/assignments/:assignmentId` (`new` for a new one) for lecturers and administrators, with the course workspace's Assignments tab and its categories; `/learner/assignments` (To do and Past due, due dates in Ghana time with the learner's extension) and `/learner/courses/:courseId/assignments/:assignmentId`; `/admin/assignments` (oversight of every course).

### Learner branches as built (D42, ADR-010)

- **Table:** `branches` (name unique, position unique, `is_active`), seeded with DDTC's six branches in DDTC's order; every signed-in user reads it and no client changes it, so DDTC can add or close a branch without a release, and a branch is never deleted.
- **Column:** `profiles.branch_id`, learners only, `ON DELETE RESTRICT`. The learner sets or changes their own through the column grant; an AAL2 administrator changes any learner's branch through `profiles_update_admin_branch`. `profiles_guard` allows anyone else to change the branch and nothing more, and refuses an unknown or closed branch ("Choose one of the branches") and a branch for staff. `audit_branch_change` records `profile.branch_changed` with who, from and to. `course_roster()` returns `branch_name`, so lecturers see their own learners' branches; learners never read another learner's.
- **Screens:** `src/lib/branches.js` loads the names once per session (emptied on sign-out). `BranchField` is the phone's own picker below 640 px and the shadcn Select from tablet width up, with a skeleton and Retry; `BranchChip` (pin and name, or "No branch") and `BranchFilter` (any branch, one branch, or "No branch") on the administrator's Users, Learners and Enrolments; Save branch in the user panel; a Branch column on the course Learners tab. Grading, the gradebook, exports and reports add it in Phases 8 to 11.

### Idle sign-out as built (D43, ADR-011)

- **Database:** settings `idle_timeout_minutes` (10, whole minutes 5 to 60) and `idle_warning_seconds` (120, 30 to 180), held to those bounds by a CHECK; changed only by an AAL2 administrator and audited. `idle_settings()` gives both to every signed-in user (learners cannot read the settings table). `private.is_admin()` refuses an administrator session idle longer than `idle_timeout_minutes` (was 30 minutes under D32); `session_limits` keeps only D32's absolute lifetimes.
- **Auth:** access tokens last 600 seconds (`supabase/config.toml`; the owner sets the same on each hosted project, `docs/RUNBOOK.md`), so a token taken from an idle session stops working within 10 minutes; every sign-out is a local sign-out that revokes that session's refresh token, and an app opened again after the limit signs out at once (see Clock).
- **Clock:** `IdleSessionProvider`, mounted for every role, loads `idle_settings()` and runs `useIdleTimeout`. One clock for every tab, `ddtc:lastActivity` in local storage (the session and a timestamp, written at most every 5 seconds and shared through storage events), compared by timestamps every second while the page is visible and at once on visibilitychange, pageshow and focus, so a phone that slept or a reload after the limit signs out straight away. Activity is pointer, key, wheel, touch, focus, form input, scrolling and moving to another page; audio playing and uploads hold the session awake (`holdAwake`, recordings join in Phase 8); token refreshes and background requests never count. Administrators also call `record_activity` at most once a minute.
- **Warning and sign-out:** `IdleWarningDialog` opens at the limit minus the warning (8 minutes): Continue Session (focused first; Escape does the same) and Sign out now, an announced countdown, unsaved work named. At the limit `signOut` goes to `/login?idle=N&next=<page>`; `clearPrivateCaches()` empties signed URLs, avatar paths and branch names on every sign-out; Sign In shows "You were signed out after N minutes of inactivity." and the next sign-in returns to the page.
- **Drafts:** `src/lib/drafts.js` keeps unsaved editor work per user and screen (`ddtc:draft:<user>:<key>`) for 24 hours, restored only over the same saved version (`useDraftStart`, `useDraftAutosave`; the lesson and assignment editors now, answers in Phase 8) with the "Draft restored" toast; a deliberate sign-out deletes the user's drafts.
- **Absolute lifetimes:** `SessionWatcher` keeps D32's limits: a warning toast without a button, then `/login?expired=1`.

### Submissions and file validation as built (Phase 8)

- **Tables:**
  - `submissions`: one per assignment and learner; DRAFT until the first version is sent (a CHECK ties DRAFT to version 0); the grading columns stay closed to clients until Phase 9.
  - `submission_versions`: numbered per submission, with plain text up to 20,000 characters, `is_late` from the server's clock, and a `client_request_id` unique per submission, so a repeated request makes no second version.
  - `submission_files`: one row per file, with its role AUDIO, PDF or DOCX; a file belongs to one version only.
  - Two triggers:
    - `private.keep_submitted_answers` refuses any change or deletion of versions and their files for every role.
    - `private.submission_files_guard` lets a file join only in the transaction that creates its version, only as a VALIDATED file of that submission, and at most `max_files_per_submission_version` (5).
  - `submission_extensions` gained `revoked_at` and `revoked_by`; a partial unique index allows one live extension; `private.effective_due_at()` ignores revoked ones.
  - `file_objects` gained `delete_attempts` and `last_delete_error`.
  - Foreign keys are `ON DELETE RESTRICT`.
- **Rules (D10 as read in ADR-013):**
  - `private.submission_check` decides who may submit and whether the answer will be late.
  - Before the effective due date a learner resubmits freely until GRADED.
  - After it, only a learner who never submitted may submit, marked late, and only where late answers are allowed.
  - Otherwise it gives a reason (graded, past due, read-only course, not open, not enrolled), shown in plain words.
- **Access:**
  - `private.can_see_submission`: the learner reads their own (drafts included); the course's active lecturers and AAL2 administrators read submitted answers only. No client writes.
  - Read functions:
    - `my_submission()` gives the learner's state, versions and waiting files.
    - `assignment_submissions()` gives managers every learner of the course except WITHDRAWN, plus anyone who submitted, with branch (D42), status, version, lateness and effective due date.
    - `submission_review()` gives managers one learner's versions with their files.
- **Storage:**
  - Private `learner-submissions` bucket: 25 MB; MP3, MP4, WAV, WebM and Ogg audio, PDF and DOCX.
  - Path `<assignment id>/<learner id>/<version>/<file id>.<ext>`.
  - Reads require a VALIDATED file and `private.can_read_submission_object`: the uploader for files sent or waiting; managers for files of submitted versions only. Nobody writes directly.
  - `lesson-audio` also accepts WebM and Ogg (decision 5).
- **Pipeline:**
  - `register-upload` (SUBMISSION_FILE) calls `submission_prepare_upload`, which creates the DRAFT submission if needed and gives the next version number.
  - The browser always uploads answers resumably (tus): it retries a dropped attempt and waits for the connection when offline ("Upload resumed").
  - `finalize-upload` accepts audio within 25 MB and 10 minutes, and PDF or Word within 10 MB where the assignment accepts them; it refuses PPTX.
  - `_shared/audio.ts` reads real browser recordings: WebM without a stored duration (last cluster), Ogg Opus or Vorbis (last page's granule), and fragmented MP4 (`mehd` or the fragments' timing).
- **Trusted functions (service role only, audited, run behind `submit-assignment` and `manage-assignments`):**
  - `submission_submit`: locks, re-checks, is idempotent, and links the files to the new version.
  - `submission_draft_file_remove`: removes a waiting file, which is then deleted from Storage at once.
  - `submission_extension_set`: set or change, with Undo.
  - `submission_extension_remove`: takes an extension back, kept with who and when.
- **Recorder:**
  - `src/lib/recording/format.js` picks the first format the browser offers: MP4 AAC, WebM Opus, WebM, Ogg Opus, then plain MP4.
  - `levels.js` turns the input into the live waveform and spots silence.
  - `use-recorder.js` runs MediaRecorder at 64 kbit/s in 1-second pieces, keeps a Wake Lock, pauses when the page is hidden, stops at the limit and holds the session awake (D43).
  - `Recorder.jsx` draws the controls and the review.
  - `recording-drafts.js` keeps a recording in progress in IndexedDB (ArrayBuffer pieces, 24 hours), deleted by a deliberate sign-out through the `onStopDrafts` hook.
  - Limits: `LEARNER_RECORDING` 10 minutes and 25 MB; `LESSON_RECORDING` 30 minutes (ADR-007).
- **Screens:**
  - The answer form (`src/components/submissions/`: `AnswerForm`, `UploadRow`, `VersionList`, `ExtensionDialog`) on the learner's assignment page, and Assignments > To do, Submitted and Past due.
  - `AssignmentSubmissionsPage` and `SubmissionViewPage` for lecturers and administrators.
  - The lesson editor's Record audio.
  - `callFunction` shows only our functions' own messages; platform errors show "Something went wrong. Try again."
- **Clean-up:**
  - `files_due_for_cleanup` adds answer files never sent (24 hours, `expired_draft_file`).
  - `cleanup-files` counts each failed removal and audits `files.cleanup_failed`.
  - `cleanup_failures()` lists files at 3 failures or more for AAL2 administrators (the alert comes in Phase 11).
- **Routes:**
  - `/:role/courses/:courseId/assignments/:assignmentId/submissions` and `.../submissions/:learnerId` for lecturers and administrators.
  - The learner answers on `/learner/courses/:courseId/assignments/:assignmentId`.

### Grading and results as built (Phase 9)

- **Tables and columns (migration 28):**
  - `submissions` gains `released_score`, `released_feedback` and `released_by`: what the learner sees, copied on release (ADR-014). RELEASED means the learner sees the current grade; a later change waits in `score` and `feedback` until released again. A CHECK keeps a released grade complete.
  - `grade_change_history`: event SAVED, RELEASED or REOPENED, previous and new score and feedback, reason, who, and when (clock time). Written by the trigger `private.record_grade_change`. `private.keep_grade_history` refuses update, delete and truncate to everyone; the service role may only select and insert.
  - `notifications`: GRADE_RELEASED and GRADE_UPDATED for now, with a unique deduplication key and a `link_path` inside the app. The recipient reads their own and may set `read_at` only.
- **Rules for any writer:**
  - `private.submissions_grade_guard` keeps the score (and the released score) between 0 and the assignment's maximum marks, and refuses a change to a released grade without a reason (`app.grade_reason`).
  - `private.assignments_max_marks_guard` stops maximum marks dropping below a given score.
- **One place for the figures (D14, D15, D30):** `private.grade_facts(score, max)` gives the percentage (two decimals), the letter grade (the highest `grade_scale` band the percentage reaches), the band (`distribution_bands`, lower <= p < upper, 100 in the last) and pass (`pass_mark`). Phase 10's `calculate_course_grades` is to build on it.
- **Trusted functions (migration 29; service role only; audited; actor and course re-checked; archived courses read-only):**
  - `grade_save`: the same grade twice changes nothing; a released grade changes only with a reason; status becomes GRADED.
  - `grade_release`: one learner or every draft grade. Refused unless category weights total 100. Copies to the released columns and writes one notification per learner and event (`grade-release:{submission}:{n}`).
  - `grade_reopen`: reason required; GRADED becomes REOPENED. `submission_check` lets a reopened answer be sent again only before the effective due date.
  - These sit behind the Edge Functions `grade-submission` (save, reopen) and `release-grades`.
- **Reads:**
  - `assignment_results` and `assignment_result_counts`, for the course's lecturers and AAL2 administrators. Every enrolment except WITHDRAWN is counted; a withdrawn learner who sent an answer is listed, not counted. Result is GRADED, UNGRADED, MISSING (nothing sent, effective due date passed) or NOT_YET_DUE. The counts always satisfy enrolled = submitted + not yet due + missing and submitted = graded + ungraded (pgTAP 20, the exit gate).
  - `submission_review` adds the grade, what the learner sees and the history.
  - `my_grade`: the learner's own released grade only.
  - The grading columns stay closed to client SELECT.
- **Screens:**
  - `SubmissionViewPage`: the grading screen. On phones, the answer, then `GradingPanel` with a bar that sticks above the navigation. From tablet width, two panes (`grid-cols-grading`), with `GradeHistory` under the panel and `ReopenDialog`.
  - `AssignmentSubmissionsPage`: the results, with `ResultCounts`, search, Show, Branch and Sort filters, one chip per learner, Grade for answers waiting, and `ReleaseAllDialog`. Cards up to 1024 px through `ResponsiveTable`'s `cardsBelow="lg"`.
  - `LearnerGradeCard` on the learner's assignment page.
  - `GradeNotices` in the learner shell: "New grade available" once per tab, read when the assignment is opened.
  - `src/lib/grading/grading.js` holds the calls and labels, with no figures.
- **Routes:** unchanged from Phase 8 (`/:role/courses/:courseId/assignments/:assignmentId/submissions[/:learnerId]`); the grading panel and results join those pages.
- **Step 9.1:** `grading_queue()` and `my_grades()` (migration 30, pgTAP 21) behind `/lecturer/to-grade` (`ToGradePage`, and the dashboard's To grade tile) and `/learner/grades` (`LearnerGradesPage`), the navigation pages promised for Phase 9; `LearnerCell` is shared with the results; `CourseCover` keeps every course cover at 16:9 (an aspect-ratio box that does not clip grows to fit a tall photo).

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

**As built (Phase 10, ADR-015):** `calculate_course_grades` (migration 31, on `private.course_grade_cells` and `private.course_grade_summary`, built on Phase 9's `private.grade_facts`), `assignment_statistics`, `gradebook_assignments`, `course_weights_locked` with the `grade_categories_lock` trigger, `weights_impact_preview`, `course_release_preview` and `grade_release_course` (pgTAP 22 and 23); migration 32 adds `i_manage_course` and `record_export`. Edge Functions: `export-gradebook` (CSV with a byte-order mark, or Excel through `_shared/xlsx.ts` and fflate; reads with the caller's token; audited), `release-grades {courseId}`, and `manage-assignments` save-categories with a reason after release. Screens: the course workspace's Gradebook and Analytics tabs (`GradebookTab.jsx`, `src/components/gradebook/`), Gradebooks and Gradebook oversight (`GradebooksPage.jsx`), and for learners Grades and feedback (one card per course) opening `/learner/courses/:courseId/grades` (`LearnerCourseGradesPage.jsx`). Charts are plain SVG with tokens (`DistributionChart.jsx`); no chart library. `src/lib/gradebook/gradebook.js` fetches and labels; it computes nothing.

**As built (Phase 10.1, ADR-016):** the course grade has three fixed parts (`grade_categories.part`: Weekly assignments 40, Local Assembly practicals 30, Final examinations 30; migration 33), changed only by an AAL2 administrator with a reason. Practicals are marked in person (`submissions.marked_in_person`, `practical_marks_save` through `grade_save`). Examinations (migrations 34 to 36: eight tables with answer keys in `exam_question_keys`; `exam_*` functions; `my_exams`, `my_exam`, `exam_results`, `exam_script`, `my_exam_deadlines`, `exam_marking_queue`; recordings as `EXAM_ANSWER_AUDIO`) count as cells of the Final examinations part in `calculate_course_grades`. Edge Functions `manage-examinations`, `exam-attempt`, `grade-examination`; export-gradebook kind `examination`. Screens: the course's Examinations tab, `ExamEditorPage`, `ExamResultsPage`, `ExamScriptPage`, `LearnerExamPage`, `PracticalMarkSheet`, `GradePartsCard`, `ExamPanels` on the dashboards; learner lists grouped by branch (`branch-groups.js`, `BranchGroups.jsx`). The deadline is enforced in database time; there is no countdown timer. Step 10.3 (ADR-018, migration 37): an answer also takes an uploaded audio file and one PDF or Word document (`exam_answers.document_file_id`, `EXAM_ANSWER_DOCUMENT`); `exam_answer_files` lists both kinds for the learner and the course's managers; `ExamDocumentLink` opens a document.

**As built (Phase 11, ADR-019):** migrations 38 to 42. Notifications for every event come from triggers (`private.notify`, one per deduplication key); email deliveries are queued by a trigger on `notifications` and sent by the `send-notification-email` Edge Function (Resend; `_shared/email.ts`) every minute; `private.schedule_reminders()` every 15 minutes keeps and fires 24-hour reminders and raises file-cleanup alerts. Announcements (`announcements`, `announcement_send`). Settings checks on `system_settings`; audit viewer and reports functions; one summary function per dashboard. Screens: the header `NotificationBell`, `NotificationsPage` (every role, with the email switch), `SettingsPage`, `AuditLogsPage`, `ReportsPage`, `AnnouncementsPage` (lecturer and administrator), `CourseAnnouncements` on the learner's course page, and `DashboardPanels`.

**As built (Step 11.1, ADR-020):** migration 43 (`presence_member`, the `realtime.messages` policies, `presence_my_courses`, `presence_people`). `src/lib/presence.js` loads `@supabase/realtime-js` on demand (token from the Auth session on connect and every heartbeat); `PresenceProvider` (in the learner and lecturer shells) joins each course channel and tracks the person; `WhoIsOnline` on the two dashboards. Local `db:start` and CI now run Realtime.

## 13. Background jobs

| Job | Runs | Purpose |
|---|---|---|
| `send-notification-email` | every minute | Sends queued emails; retries up to 5 times (1, 5, 15, 60, 240 minutes) |
| `schedule-reminders` | every 15 minutes | Creates one due-date reminder 24 hours before the due date, once per learner and assignment |
| `cleanup-files` | hourly | Removes expired pending uploads, rejected files, replaced avatars or covers, and answer files never sent (after 24 hours); counts and audits each failed removal (`cleanup_failures()`); never touches lesson audio, instruction audio, attachments or submitted answers |
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
| Everyone | Session about to reach its absolute limit (D32; inactivity warns with a dialog instead, D43) | "Your session ends in 2 minutes" (W) | none |
| Everyone | Unsaved work put back into an editor after an idle sign-out (D43) | "Draft restored" (I) | none |
| Everyone | Any save or request fails | "Could not save. Try again" (E) | Retry |
| Administrator | Learner added or invitation sent | "Learner added" (S) | none |
| Administrator | Lecturer provisioned | "Lecturer invited" (S) | none |
| Administrator | Administrator invited (ADR-003) | "Administrator invited" (S) | none |
| Administrator | CSV import finished | "Imported N learners, M errors" (S or W) | View report |
| Administrator | Role or course-creation permission changed | "Permissions updated" (S) | none |
| Administrator | A learner's branch changed (D42) | "Branch updated" (S) | none |
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
| Lecturer | Lessons or a lesson's audio files reordered | "Order saved" (S) | Undo |
| Lecturer | Lesson audio passes checks | "Audio ready" (S) | none |
| Lecturer | Lesson audio rejected | "Audio rejected: reason" (E) | Try again |
| Lecturer | Lesson audio replaced | "Audio replaced" (S) | none |
| Lecturer | Attachment added | "Attachment added" (S) | none |
| Lecturer or administrator | Lesson audio deleted, after confirming (ADR-007) | "Audio deleted" (S) | none |
| Lecturer or administrator | Attachment deleted, after confirming (ADR-007) | "Attachment deleted" (S) | none |
| Lecturer or administrator | Course cover removed, after confirming (ADR-007) | "Cover image removed" (S) | none |
| Lecturer or administrator | A delete failed; the item stays (ADR-007) | "Could not delete: reason" (E) | Try again |
| Lecturer | Assignment saved or published | "Assignment saved" or "Assignment published" (S) | none |
| Lecturer or administrator | Assignment unpublished (Phase 7) | "Assignment unpublished" (S) | none |
| Lecturer or administrator | Assignment archived, never deleted (Phase 7) | "Assignment archived" (S) | Undo |
| Lecturer or administrator | Archived assignment restored (Phase 7) | "Assignment restored" (S) | none |
| Lecturer or administrator | Grade categories saved (Phase 7) | "Categories saved" (S) | none |
| Lecturer or administrator | Extension granted or changed | "Extension granted" (S) | Undo |
| Lecturer or administrator | Extension taken back (owner decision 6, 2026-11-08; the record is kept) | "Extension removed" (S) | none |
| Lecturer | Grade draft saved | "Grade saved as draft" (S) | none |
| Lecturer | Grades released | "Grades released to N learners" (S); for one, learner | none |
| Lecturer | Score out of range | "Score must be between 0 and maximum" (E) | none |
| Lecturer | Submission reopened | "Submission reopened" (S) | none |
| Lecturer | Gradebook export ready | "Export ready" (S) | Download |
| Learner | Lesson marked complete or incomplete | "Lesson completed" or "Marked not complete" (S) | Undo |
| Learner | Audio download starts | "Downloading audio (size)" (I) | none |
| Learner or lecturer (lesson audio, ADR-007) | Recording saved or discarded | "Recording saved" or "Recording discarded" (S) | none |
| Learner or lecturer (lesson audio, ADR-007) | Microphone blocked | "Microphone blocked. Upload a file instead" (W) | Upload file |
| Learner | Submission received | "Submission received" (S) | none |
| Learner | Late submission received | "Submitted late" (W) | none |
| Learner | Resubmitted | "Resubmitted as version N" (S) | none |
| Learner | File rejected | "File not accepted: reason" (E) | Try again |
| Learner | Upload interrupted then resumed | "Upload resumed" (I) | none |
| Learner | Grade released | "New grade available" (I) | View |

### Idle sign-out (D43, ADR-011)

Not a toast: a dialog, because it needs an answer. After `idle_timeout_minutes` minus `idle_warning_seconds` without activity (8 minutes by default) an alert dialog opens: title "Your session ends in 2 minutes", the time the user has been away, a countdown (screen readers hear it at whole minutes and at 30 and 10 seconds), "You have unsaved changes. If you are signed out, they are kept on this device as a draft for 24 hours." when a screen has unsaved work, and the buttons **Continue Session** (focused first; Escape does the same) and **Sign out now**. A tap outside does nothing. At the limit the user is signed out and Sign In shows the status message "You were signed out after 10 minutes of inactivity." (the configured number of minutes); the next sign-in returns to the same page.

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


## 16. Environments, deployment and recovery

- Three environments: development, staging, production, each with its own Supabase project. Real learner data is never used in development or staging.
- Every change goes through a pull request; CI runs lint, type checks, unit tests, database rule tests, Playwright and Lighthouse before it can merge.
- Database changes are numbered migrations only; nothing is changed by hand in the dashboard. The exception is hosted Auth settings that migrations cannot reach, such as the 600-second access-token lifetime (D43): the owner sets them on each hosted project and checks them as in `docs/RUNBOOK.md`; `supabase/config.toml` holds the same values for local runs and CI.
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
- Auth screens (ADR-012): the shared hero shows the emblem, the name DYNAMIC DISCIPLESHIP TRAINING CENTRE (HOJ) and the tagline "Di nokware kosi owu mu, na wobenya nkwa abotiri - Adiyisɛm 2:10b" (Twi, marked `lang="tw"`). On Sign In, Sign Up and two-step verification a light travels round the emblem's circle (`logo-glow`, a decorative ring over the emblem; never the favicon, app icons or in-app logos) and the administrator's verification card carries the same edge light; both stand still under reduced motion and disappear in forced-colours mode. Sign In and Sign Up end with "© YEAR Dynamic Discipleship Training Centre (HOJ). All rights reserved." well below "from gölarae" (the year in Ghana time).
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
