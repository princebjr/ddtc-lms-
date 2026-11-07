# DDTC LMS: Final Build Specification and Phase Plan

Version 1.7 — consolidated, implementation-ready build specification. Version 1.4 added the device and responsive standard (D36 and Section 15). Version 1.5 removed Sign in with Apple. Version 1.6 removes academic terms, removes the module layer so that a course contains lessons only, and adds the interface feedback standard for toasts, floating action buttons and skeleton screens (D37 and Section 16). Version 1.7 adds Continue with Google for learners on the Sign In and Sign Up pages (D01, D22, D27), the phone navigation with three icons plus More (D40), the official DDTC LMS logo and the gölarae logo with their placement rules (D39), and the navy-and-blue design system with Inter, dark mode and the clickable prototype (D38). This document supersedes all earlier drafts and the original brief. Version 1.3 closes the open points found in review of v1.2: file registry and storage paths, signed-URL ownership, grade-calculation edge cases, session and recovery values, retry and backup values, and missing jobs.


## 1. How to use this document

- This is the single source of truth. Copy it to `docs/BUILD_PLAN.md` in the repository. Claude Code must obey it and must not invent policy.
- Every value marked **default** lives in the `system_settings` table and can be changed later by an administrator without code changes. Everything else is fixed in code and changes only through a written decision record (ADR) in `docs/DECISIONS.md`.
- This document replaces the original brief for all implementation and acceptance purposes. Brand rule: the gölarae logo appears directly below the Sign In form and directly below the Sign Up form, and directly beneath that logo the exact text **"from gölarae"**. "powered by gölarae" is never used.
- Learners sign up and sign in with email and password or with Continue with Google; administrators and lecturers use email and password only. There is no Apple or other social sign-in in this release. See D01, D22 and D27. This document is intended to be self-contained; do not depend on an earlier brief for implementation or acceptance criteria.
- Accepting this document means accepting every decision in Section 3. If you want a different answer for any decision, change it in Section 3 before Phase 0 starts.


## 2. Version 1 scope


**In scope for this release (release tag v1.0.0)**

- Three roles (Administrator, Lecturer, Learner); email-and-password authentication with email verification, and Continue with Google for learners; initials avatars and profile pictures; courses with lecturers and enrolment; lessons with downloadable audio; assignments with text and audio instructions; submissions (text, recorded audio, uploaded audio, PDF, Word); grading with feedback and history; course gradebooks; score distribution charts; notifications; audit logs; automated learner-audio retention; testing; production deployment.
- Additions made core: lesson attachments, grade categories and weights, `system_settings`, bulk CSV learner import, toast notifications, floating action buttons, skeleton screens, administrator MFA, CAPTCHA and rate limiting, resubmission and extension rules, three-step validated upload pipeline, low-bandwidth measures (resumable large uploads, pagination, installable PWA shell), email notifications, Storage backup, staging environment.


**Out of scope for this release (future backlog)**

- Quizzes, attendance, course discussion or messaging, video, certificates, announcements, transcripts or captions, prerequisites, self-enrolment, impersonation, offline lesson reading beyond downloaded audio.


## 3. Locked decisions

| ID | Topic | Final decision |
|---|---|---|
| D01 | Sign-up | Open registration for learners in two ways: email and password with mandatory email verification, or Continue with Google (D27). The email Sign Up form requires first name, second name, email and password. A new account by either method is LEARNER with status ACTIVE and sees no course until an administrator enrols it. No role selector exists in the UI. |
| D02 | Roles | Enum ADMIN, LECTURER, LEARNER on `profiles.role`. Lecturers also have `can_create_courses` (boolean, default false). Only an administrator, through the `set-user-role` Edge Function, can change either field. **ADR-008:** every account also has a six-digit `id_number` (100000 to 999999) assigned by the database, unique, never changed or reused. |
| D03 | Account status | Enum ACTIVE, SUSPENDED, DEACTIVATED. Only ACTIVE users can use the system. Suspended and deactivated users are signed out and refused at login with a clear message. |
| D04 | Course approval | `require_course_approval` = true (default). Lecturer submits (PENDING_APPROVAL); administrator approves (PUBLISHED) or returns with a reason (DRAFT). If the setting is turned off, lecturers publish directly. Every change is audited. |
| D05 | Enrolment | Administrator-only, single or bulk CSV. No self-enrolment, invite codes or auto-enrolment. Statuses: ACTIVE, COMPLETED, WITHDRAWN, SUSPENDED. ACTIVE gives full access. COMPLETED gives read-only access (lessons, audio, own released grades; no new submissions or resubmissions) and is set only by an administrator, singly or in bulk, when a learner has finished the course. WITHDRAWN and SUSPENDED give no access. |
| D06 | Course teaching roles | `course_lecturers.permission_level` is OWNER or CO_LECTURER. The creator is OWNER. CO_LECTURER can do everything except archive the course or manage other lecturers. Only the administrator or OWNER can add or remove lecturers. |
| D07 | No academic terms | The system has no terms, semesters, class groups or academic years, and courses have no start or end date. A learner's period in a course is their enrolment. Archiving a course makes it read-only for learners (they keep access to lessons and released grades; no new submissions or resubmissions) and hides it from active course lists. |
| D08 | Lessons | A course contains an ordered list of lessons and nothing in between: there is no module, section or unit layer, and the word module is not used anywhere in the product. `lessons.position` is an integer, unique within the course; reordering is atomic. |
| D09 | Lesson audio | Multiple files kept as history in `lesson_audio_files`. Exactly one ACTIVE per lesson (partial unique index). Replacing marks the old file SUPERSEDED and keeps it. Archiving a course never deletes audio. **Changed by ADR-007:** a lesson has up to 10 ACTIVE audio files, each with a title and a position; replacing one keeps its place; deleting one keeps its record (DELETED, who and when) and removes its file from Storage. |
| D10 | Submissions | One `submissions` row per learner and assignment, with versions in `submission_versions`. Resubmission is allowed until the due date and while status is not GRADED. After the due date, submission is blocked unless the assignment has `allow_late` = true or the learner has an extension. Late = server time after the effective due date; it is flagged and never auto-penalised. The latest version is graded and older versions are kept. A lecturer can reopen a graded submission (audited, recorded in grade history). Maximum 5 files per version. |
| D11 | Missing work | `missing_as_zero` (default false) controls treatment of published assignments with an effective due date that has passed and for which the learner has no submitted version. Before the effective deadline, missing work is not counted. If false, missing work is excluded from calculations and shown as Missing. If true, it contributes zero earned marks and the assignment maximum to its category denominator, and is labelled “Counted as 0”. Missing work never creates a submission row solely to represent zero. Ungraded submitted work is not missing and is excluded from grade calculations until its grade is released. |
| D12 | Grade categories | Each course has categories (for example Assignments, Participation) with weights that must total 100 before the first grade is released. Default: one category Assignments at 100. Each assignment belongs to one category. |
| D13 | Overall grade formula | Effective due date = the learner's extension if one exists, otherwise `due_at`. An assignment counts toward a learner's category in exactly two cases: (a) the learner has a **released** graded submission, whatever the due date (so early-submitted work counts once released); or (b) `missing_as_zero` is true, the assignment is published, its effective due date has passed, and the learner has no submitted version (counted as 0 of the assignment maximum). Everything else is excluded: future assignments with no released grade, submitted work awaiting grading or release, draft grades, and unpublished assignments that have no released grades. An assignment unpublished or archived after grades were released still counts for those learners (D29 keeps the records). A late submission lifts a counted zero as soon as the version is submitted; it is then excluded until its grade is released. Category percentage = sum(earned marks of counted items) / sum(maximum marks of counted items) × 100. Overall = weighted average of category percentages, divided by the sum of weights of categories that have at least one counted item. Weights are validated to total exactly 100 before the first grade release and are then locked; changing them needs an audited administrator workflow with an impact preview. Display to one decimal, rounded half up. Status per learner: **Final** when every published assignment is either released-graded or past its effective due date with no submission; otherwise **Provisional**. If nothing is counted, show "Not yet available", never 0%. |
| D14 | Grade scale (default) | A 80-100, B 70-79, C 60-69, D 50-59, F 0-49. Pass mark 50. Percentage = score / max_marks x 100. |
| D15 | Distribution bands (default) | 0-49, 50-59, 60-69, 70-79, 80-89, 90-100, using lower <= percentage < upper, with 100 included in the last band. Learner charts require at least `min_class_size` graded results (default 5); lecturers and administrators always see them. Charts use released, graded results only. |
| D16 | Release of grades | Grades are DRAFT until released. Release works per submission or for a whole assignment. Learners see score, percentage, band and feedback only after release. Release creates a notification and an audit record. |
| D17 | File limits (defaults) | Lesson audio 100 MB and 90 min (mp3, m4a, wav). Assignment instruction audio 25 MB and 10 min. Learner submission audio 25 MB and 10 min (mp3, m4a/mp4, wav, webm, ogg). PDF and DOCX 10 MB. Lesson attachments 25 MB (PDF, DOCX, PPTX). Profile image 2 MB (jpg, png, webp). Course cover 2 MB. |
| D18 | Upload pipeline | Every uploaded file type uses one consistent three-step pipeline: `register-upload` checks authorization and creates a PENDING `file_objects` row with a server-generated immutable path; the browser uploads only to that path; `finalize-upload` verifies actual file signature/magic bytes, MIME, size, duration where applicable, file-specific constraints and ownership, then sets VALIDATED or REJECTED. Resumable upload is required for files over 25 MB. Storage reads require a matching VALIDATED file record plus the resource-specific access rule. Rejected objects are removed; removal failures are recorded and retried. Pending uploads expire after 24 hours and are cleaned by a scheduled job. Never trust client-provided paths, MIME type, size, duration, user ID or resource ownership. |
| D19 | Downloads and streaming | Signed URLs are created in the browser with the signed-in user's own session using Supabase Storage `createSignedUrl`. Storage policies authorise each request by joining `file_objects` (status VALIDATED) with the resource rule in Sections 6 and 7. No Edge Function and no service-role credential is used for playback or download. Expiry: 3600 seconds for playback, 300 seconds for download. The download option uses `safe_download_filename`. New URL requests from a suspended or deactivated user are denied at once; a URL already issued stays valid until it expires (at most one hour), which is an accepted and documented risk. |
| D20 | Retention (default off) | Applies only to learner-submitted audio. Eligible when the grade is released, at least `retention_days` (default 180) have passed since release, no active hold exists, the `file_objects` row is VALIDATED, and the file role is AUDIO on a `submission_files` row. Text, PDF and Word files are never auto-deleted. `retention_enabled` = false at launch; the job runs in dry-run for the first 30 days after launch and only an administrator can enable real deletion. After deletion the `file_objects` row stays with status DELETED and `deleted_at`; a failed attempt sets DELETE_FAILED and is retried. Staging tests set `retention_days` to 0 with seeded fixtures; production stays at 180 unless DDTC approves a change. |
| D21 | Notifications | In-app plus email for: grade released, assignment published, due date in 24 hours, enrolment added, course approved or returned. Users can turn off non-account emails. Account emails (verification, reset) are always sent. |
| D22 | Authentication | Learners: email and password (minimum 8 characters, email verification required; owner change 2026-11-05, was 10; applies to every account) or Continue with Google. Administrators and lecturers: email and password only. TOTP MFA required for ADMIN, and every ADMIN policy requires an AAL2 session. No CAPTCHA (owner change 2026-11-05: Cloudflare Turnstile removed because it slowed sign-in; Supabase Auth rate limits per IP still apply). Sign-in error messages never reveal whether an email address is registered. |
| D23 | Language and typing | JavaScript (ES modules) as in the brief, with JSDoc types and `checkJs` enforced in CI, Zod validation on all inputs, and database types generated by the Supabase CLI. Edge Functions use TypeScript (the platform default). |
| D24 | Time | All timestamps are `timestamptz` in UTC and displayed in Africa/Accra. Lateness and due dates are evaluated on the server only. |
| D25 | Deletion and retention rules | No application path hard-deletes academic or audit records. Every foreign key that references an academic record (courses, lessons, assignments, submissions, grades, files, history) uses `ON DELETE RESTRICT`; courses and content are archived and accounts are deactivated. Legally required erasure or anonymisation happens only through a documented administrator procedure approved by DDTC's privacy owner (Section 13), which anonymises personal fields rather than deleting academic rows, and is scoped and audited. Personal data, authentication data, files, logs and backups each need a documented retention schedule reviewed by DDTC's privacy or legal adviser before production. **Exception (ADR-007):** when a lecturer or administrator deletes a lesson audio file, a lesson attachment or a course cover, the file is removed from Storage; its record is kept. |
| D26 | Infrastructure | Frontend on Vercel. Supabase in the closest available region to Ghana (confirm in the dashboard), production on a paid plan with daily backups. Resend for SMTP. Sentry for errors. GitHub Actions for CI. Three environments: development, staging, production. |
| D27 | Continue with Google | Offered on both Sign In and Sign Up, for learners only. (1) The button uses Google's official branding (G mark, "Continue with Google", light and dark variants), full width, below the main button with an "or" divider. (2) Supabase Google provider with the scopes `openid email profile` only; only Google accounts whose email is verified are accepted; no verification email is sent. (3) A new Google account becomes LEARNER and ACTIVE through the same database trigger as email sign-up; role is never accepted from client data. First and second name are copied from the Google profile; if either is empty, a required Complete your profile screen collects them before any dashboard opens (`profiles.profile_completed`). (4) A Google sign-in whose verified email matches an existing ADMIN or LECTURER is refused with a clear message and links nothing; administrators and lecturers cannot add Google as a sign-in method. (5) A Google sign-in whose verified email matches an existing LEARNER with a verified email links to that account; if that account's email is unverified, sign-in is refused and the user is asked to verify first. (6) The Google profile photo is not imported; the learner shows initials until they upload a photo through D18. (7) The OAuth consent screen shows the name DDTC LMS, the DDTC logo, a support email and public links to the privacy notice and terms, and its publishing status is In production before launch. (8) Google blocks sign-in inside embedded in-app browsers (WhatsApp, Facebook, Instagram, TikTok), so the app shows the Open in Safari or Chrome notice. (9) Each environment (development, staging, production) has its own OAuth client and redirect URL. (10) Phase 3 must state the Supabase mechanism used for (4) and (5) and prove both with tests. Email and password remains available to every learner. |
| D28 | Course permission lifecycle | `can_create_courses` controls creation only. Revoking it blocks new course creation but does not remove the lecturer from courses already assigned. An administrator can transfer OWNER status to another active lecturer; all lessons, assignments, submissions, grades, enrolments and audit history remain intact. Deactivating a lecturer triggers an administrator task to reassign ownership and teaching duties; it never deletes records. Every permission and ownership change is audited. |
| D29 | Published content changes | Published courses, lessons and assignments may be edited only by authorized course lecturers, subject to these safeguards: deadline changes are audited and notify affected learners; changes to maximum marks, grading criteria, instructions, or category after submissions or grading exist require a confirmation screen, an impact preview, and an audit reason. Preserve a snapshot/version of the published assignment instructions and key grading fields for audit. Unpublishing or archiving never deletes learner submissions, released grades, or history. |
| D30 | Grade change and recalculation | Grades are never stored as aggregates. Category percentages, overall grades, bands, statistics and chart counts are computed on read by a single database function, `calculate_course_grades`, used by every screen and export; no formula exists in frontend code. Because nothing is cached, every change to a score, feedback release state, assignment maximum marks, assignment set or category weights is reflected immediately and the calculation is idempotent. Changing a previously released grade creates immutable grade history, an audit event and a learner notification. Introducing any cache or stored aggregate needs an ADR. |
| D31 | Notification delivery | In-app notifications are durable records. Email delivery is asynchronous and tracked in `notification_deliveries` (status, attempts, provider message ID, last error, timestamps). A transient failure is retried up to 5 attempts, waiting 1, 5, 15, 60 and 240 minutes after each failure; after that the status is FAILED and an alert is raised. A permanent failure (for example an invalid address) is FAILED at once with no retry. A user-visible notification is never duplicated for the same event. Due-date reminders use the deduplication key `reminder:{assignment_id}:{learner_id}:{effective_due_at}`; a deadline or extension change cancels the old pending reminder and creates a new one. |
| D32 | Sessions and recovery | ADMIN accounts require TOTP MFA and an AAL2 session for every privileged operation. Session limits: ADMIN idle timeout 30 minutes and absolute lifetime 12 hours; LECTURER idle 8 hours and absolute 7 days; LEARNER idle 7 days and absolute 30 days. Phase 3 verifies what the Supabase plan enforces and implements any limit the platform cannot enforce with a server-side check for ADMIN and a client timeout for others, documented in the phase plan. Suspension and deactivation revoke all sessions. Password recovery is by email link. At least two active ADMIN accounts must exist before production. A lost MFA device is reset by the other ADMIN through the `reset-admin-mfa` function (requires AAL2, rate-limited, audited); if no other ADMIN is available, the owner-controlled recovery procedure in the runbook applies and is audited afterwards. Bootstrap access is one-time and disabled after initial setup. |
| D33 | File registry | Every uploaded object has exactly one `file_objects` row, whose `status` is PENDING, VALIDATED, REJECTED, DELETED or DELETE_FAILED. Resource-level lifecycle (for example SUPERSEDED, ARCHIVED) lives only on the resource tables, never on `file_objects`. Resource tables reference `file_object_id` and never duplicate validation state or store raw storage paths. All file types, including instruction audio, profile images and course covers, use D18. |
| D34 | Backup and recovery objectives (defaults) | RPO 24 hours (daily database backup, plus a daily Storage backup); RTO 8 hours; backup retention 30 days; restore drill before launch and every quarter after. DDTC may approve different values before production, but none may be left blank. A backup is verified only after restore and integrity checks pass on both database rows and Storage objects. |
| D35 | Locale and grade privacy | Dates and times display in Africa/Accra; database timestamps remain UTC. Learners can view only their own detailed marks and feedback. Class statistics are aggregate-only and hidden below `min_class_size`; do not expose learner identities, exact ranks, or downloadable class-level individual scores to learners. Lecturers see identifiable class results only for courses they teach; administrators may view authorized institutional reports. |
| D36 | Devices and responsiveness | The whole system is mobile-first and fully usable on phones, tablets and desktops, in portrait and landscape, from 320 px wide upward, with no horizontal page scrolling at any width. Supported: iOS 17 and later Safari (iOS 18 is the primary test target), the last two versions of Chrome and Samsung Internet on Android, and the last two versions of Chrome, Edge, Firefox and Safari on desktop. In-app browsers (WhatsApp, Facebook, Instagram, TikTok) are not supported; the app detects them and shows an "Open in Safari or Chrome" notice. The full standard, budgets and test matrix are in Section 15 and apply to every screen in every phase. |
| D37 | Interface feedback | Toast notifications, floating action buttons and skeleton screens follow Section 16 exactly. Only the toasts and floating action buttons listed there exist; adding another needs an ADR. Every page that loads data shows a matching skeleton, with the 150 ms and 300 ms timing rules. |
| D38 | Design system | `docs/DESIGN.md` v3.0 is the official design reference: navy-and-blue brand palette (primary #2563EB, navy #0F172A, slate #64748B, surface #F1F5F9, success #0F766E, warning #D97706, error #DC2626) with a separately defined dark theme; Inter on every device; Lucide icons; Light, Dark and System themes stored in the browser; design tokens and shared components only. Mobbin is a reference library, not a template; Apple-inspired principles guide polish. The clickable prototype in `docs/prototype/` is the visual reference for layouts and flows. |
| D39 | Logos and brand line | Official DDTC LMS logo: `logo-ddtc` (circle emblem). Logo of gölarae: `logo-golarae`. Under the Sign In and Sign Up forms the gölarae logo sits directly above the exact text "from gölarae", centred, with nothing between them. Logos are rendered through one `LogoMark` component (navy on light surfaces, white on dark) and are never altered. App icons are the white DDTC emblem on #0F172A; the favicon needs a simplified variant that stays legible at 32 px. Asset files are in `assets/brand/`. |
| D40 | Phone navigation | On phones the bottom bar is a floating pill with exactly three destination icons plus a permanent More button (four items). Icons only: the name of a destination appears only on the active item, which expands with a short animated morph (about 320 ms, spring curve; instant under reduced motion). Per role: Administrator: Dashboard, Users, Courses; Lecturer: Dashboard, My Courses, To grade; Learner: Dashboard, My Courses, Assignments. More opens a bottom sheet with every other destination and Sign out, and is highlighted while the sheet is open or when the current page lives under it. Every item has an accessible name and a 44 px target. |


## 4. Inputs DDTC must supply (with the phase that needs each)

1. Official domain name for the app and for email sending (for example the sender address for verification emails). Needed before Phase 3.
2. Logo files (supplied: `logo-ddtc`, `logo-golarae`; a vector SVG copy of each is preferred, plus a simplified DDTC mark for the favicon) and brand colours (supplied). Needed before Phase 1.
3. Administrator accounts: first administrator princebjr1638@gmail.com and second administrator nyamekyesolomon856@gmail.com (supplied; first and second names still needed for each, needed before Phase 4) and the person who will own the production Supabase account (needed before Phase 14).
4. Confirmation or edits to defaults D14, D15, D17, D20, D31 and D32. Needed before Phase 0.
5. Privacy notice and terms of use text (a legal reviewer should check data-protection requirements). Needed before Phase 3, because the Google consent screen requires public links to both.
6. Support contact for the Help section. Needed before Phase 14.
7. A privacy/data-protection owner and a documented contact for data requests and security incidents. Needed before Phase 13.
8. Approved retention schedules for academic records, account/profile data, logs, uploaded files and backups; a legal/privacy review of the policy in D25. Needed before Phase 13.
9. Approval of the D34 defaults or alternative values, and incident escalation contacts. Needed before Phase 13.
10. Two named people who will each hold an administrator account, and a secure out-of-band recovery procedure (D32). Needed before Phase 14.
11. A Google Cloud project owned by DDTC with the OAuth consent screen (app name DDTC LMS, DDTC logo, support email, authorised domain, public privacy notice and terms URLs) and three OAuth clients (development, staging, production) whose client IDs and secrets go into Supabase. Needed before Phase 3 (staging) and Phase 14 (production).
12. A named person who owns the Google Cloud project and checks the OAuth consent screen status. Needed before Phase 3.


## 5. Final data model

All tables have `id uuid` primary keys (except where noted), `created_at`, and `updated_at` maintained by trigger. RLS is enabled on every table with no default access.

| Table | Key columns and constraints |
|---|---|
| profiles | id (= auth.users.id, FK), first_name, second_name, email, contact_number, role, can_create_courses, account_status, profile_completed, profile_image_file_id. Role, status and can_create_courses are not user-editable. |
| system_settings | key (PK), value (jsonb), updated_by, updated_at. Holds all values marked default. |
| courses | title, course_code (unique), description, learning_objectives, category, cover_image_file_id, created_by, status, missing_as_zero, archived_at. |
| course_lecturers | course_id, lecturer_id, permission_level, assigned_by. Unique (course_id, lecturer_id). |
| course_enrollments | course_id, learner_id, enrolment_status, enrolled_at, enrolled_by. Unique active enrolment per (course_id, learner_id) via partial index. |
| lessons | course_id, title, content (sanitised HTML), position, publication_status, created_by. Unique (course_id, position). |
| file_objects | id, bucket_name, storage_path (unique), original_filename, safe_download_filename, detected_mime_type, file_size, duration_seconds, uploaded_by, status (PENDING, VALIDATED, REJECTED, DELETED, DELETE_FAILED), resource_type, resource_id, checksum, validation_error, uploaded_at, validated_at, deleted_at. Server-generated paths; no client write access to `status` or any validation field. |
| lesson_audio_files | lesson_id, file_object_id, uploaded_by, lifecycle_status (ACTIVE, SUPERSEDED, ARCHIVED). Partial unique index: one ACTIVE file per lesson. File validation state comes from `file_objects`. |
| lesson_attachments | lesson_id, file_object_id, uploaded_by, title, position. Validation state comes from `file_objects`. |
| lesson_progress | learner_id, lesson_id, completion_status, completed_at. Unique (learner_id, lesson_id). |
| grade_categories | course_id, name, weight (0-100). Weights per course must total 100 before first release. |
| assignments | course_id, lesson_id (nullable), category_id, title, description, content_type (TEXT, AUDIO, TEXT_AND_AUDIO), text_instructions, instruction_audio_file_id, due_at, allow_late, max_marks (>0), accepted_formats (array, checked), grading_criteria, publication_status, created_by, published_at, archived_at. CHECK constraints enforce instruction-type rules. |
| assignment_versions | assignment_id, version_number, title, description, content_type, text_instructions, instruction_audio_file_id, due_at, max_marks, accepted_formats, grading_criteria, changed_by, change_reason, created_at. Preserves published snapshots and material edits. |
| submission_extensions | assignment_id, learner_id, extended_due_at, granted_by. Unique (assignment_id, learner_id). |
| submissions | assignment_id, learner_id, status (DRAFT, SUBMITTED, GRADED, REOPENED), current_version, is_late, score, feedback, graded_by, graded_at, grade_release_status (DRAFT, RELEASED), released_at. Unique (assignment_id, learner_id). CHECK score between 0 and the assignment's max_marks (enforced by trigger). |
| submission_versions | submission_id, version_number, text_answer, submitted_at, is_late. Unique (submission_id, version_number). |
| submission_files | submission_version_id, file_object_id, file_role (AUDIO, PDF, DOCX, OTHER). Validation/deletion state comes from `file_objects`. |
| grade_change_history | submission_id, previous_score, new_score, previous_feedback, new_feedback, changed_by, reason, changed_at. Written by trigger; no UPDATE or DELETE. |
| notifications | recipient_id, notification_type, title, message, related_entity_type, related_entity_id, deduplication_key, read_at, created_at. Unique deduplication key where present. |
| notification_deliveries | notification_id, channel (EMAIL), status (QUEUED, SENT, RETRYING, FAILED, SUPPRESSED), attempts, provider_message_id, last_error, next_attempt_at, sent_at, updated_at. |
| notification_preferences | user_id, email_enabled (boolean). |
| audit_logs | actor_id, action, entity_type, entity_id, metadata (jsonb), created_at. Insert by triggers and Edge Functions only; no UPDATE or DELETE for anyone. |
| retention_holds | scope (SUBMISSION, LEARNER, COURSE), scope_id, reason, placed_by, placed_at, released_at. |
| retention_runs | started_at, finished_at, mode (DRY_RUN, LIVE), eligible_count, deleted_count, failed_count, details (jsonb). |


## 6. Storage buckets (all private except noted)

| Bucket | Path pattern | Who writes | Who reads |
|---|---|---|---|
| lesson-audio | {course_id}/{lesson_id}/{file_id}.{ext} | Course lecturers (via pipeline) | Course lecturers, ACTIVE or COMPLETED enrolled learners (published lesson, VALIDATED file), administrators |
| lesson-attachments | {course_id}/{lesson_id}/{file_id}.{ext} | Course lecturers | Same as lesson-audio |
| assignment-instructions-audio | {course_id}/{assignment_id}/{file_id}.{ext} | Course lecturers | Course lecturers, enrolled learners (published assignment), administrators |
| learner-submissions | {assignment_id}/{learner_id}/{version}/{file_id}.{ext} | The learner (own folder, before due date or extension) | The learner, lecturers of that course, administrators |
| profile-images | {user_id}/{file_id}.{ext} | The owner only | Any signed-in user (low sensitivity) |
| course-covers | {course_id}/{file_id}.{ext} | Course lecturers | Any signed-in user who can see the course |


Replacing a profile image or course cover creates a new `file_objects` row; the old object is removed by the `cleanup-files` job. That job never touches lesson audio, instruction audio, attachments or submission files.


## 7. Access rules (enforced by RLS and Storage policies)

| Resource | Administrator | Lecturer | Learner |
|---|---|---|---|
| Profiles | Read all; change role and status only through Edge Functions | Read own; read learners of own courses (name, avatar) | Read and edit own permitted fields only |
| Courses | All | Create if can_create_courses; read and edit only own (course_lecturers) | Read PUBLISHED courses they are enrolled in |
| Enrolments | All | Read for own courses | Read own |
| Lessons and audio | Read all | Create, edit, upload, download for own courses | Read published lessons; stream and download VALIDATED audio of enrolled courses |
| Assignments | Read all | Create and manage for own courses | Read published assignments of enrolled courses |
| Submissions and files | Read all | Read for own courses | Create and read own only, within the rules in D10 |
| Grades and feedback | Read all; edit as authorised | Grade and edit for own courses | Read own, RELEASED only |
| Gradebook and charts | All courses | Own courses, full detail | Own results only; aggregate chart only when D15 allows |
| Exports | All | Own courses only | None |
| Course ownership and permissions | Grant or revoke `can_create_courses`; transfer OWNER; manage lecturers | OWNER manages co-lecturers of own course; CO_LECTURER cannot | None |
| Files not in VALIDATED status | See metadata only | See own uploads' metadata only; never downloadable | See own uploads' metadata only; never downloadable |
| Assignment versions (snapshots) | Read | Read for own courses | None |
| Audit logs and history | Read | Read grade history for own courses | None |
| System settings | Read and edit | Read non-sensitive | None |


## 8. Edge Functions, scheduled jobs and database functions (trusted server-side code)

- `set-user-role`: administrator only; changes role, `can_create_courses` and status; writes audit.
- `provision-lecturer`: administrator only; creates or promotes a lecturer and sends the invitation.
- `bulk-import-learners`: administrator only; validates CSV, previews, creates accounts, enrols; returns an error report.
- `create-course`: checks `can_create_courses`; creates the course, the OWNER row and the audit record in one transaction.
- `register-upload` and `finalize-upload`: the validated upload pipeline in D18.
- `submit-assignment`: checks enrolment, publication, due date, extensions, version rules; creates the version and sets lateness from server time.
- `release-grades`: releases one submission or a whole assignment; writes notifications and audit.
- `export-gradebook`: checks the caller's rights over the course; returns CSV or XLSX; writes audit.
- `retention-runner`: invoked by `pg_cron`; implements D20 exactly, dry-run first; writes `retention_runs` and audit.
- `send-notification-email`: worker run every minute by `pg_cron`; sends due `notification_deliveries` through Resend, respecting preferences, using the retry schedule in D31.
- `schedule-reminders`: run every 15 minutes by `pg_cron`; creates 24-hour due-date reminders with the deduplication key in D31.
- `cleanup-files`: run hourly by `pg_cron`; removes expired PENDING uploads (older than 24 hours), REJECTED objects and replaced profile images and covers; retries DELETE_FAILED; records outcomes and audit; never touches lesson audio, instruction audio, attachments or VALIDATED submission files.
- `reset-admin-mfa`: administrator only; resets another administrator's MFA factor under D32.
- Database function `calculate_course_grades` (SQL, read-only): the only place grade formulas exist (D30).


## 9. Engineering rules for Claude Code

- **One phase per session.** Never begin phase N+1 until phase N's exit gate is green and the Git tag is created.
- **Plan first.** At the start of a phase, write a plan listing migrations, files, policies and tests; wait for approval.
- **Security tests first.** For each new table, bucket or function, write the allow and deny tests for every role before writing the policy.
- **Migrations only,** through the Supabase CLI. No manual changes in the dashboard.
- **No service-role key in the browser.** CI fails if the key or any `SERVICE_ROLE` text appears under `src/` or in a `VITE_` variable.
- **Never trust the client** for user ID, role, course ID, score, path or permission; re-check on the server.
- **Mobile-first (D36).** Design and build every screen at 375 px first, then enlarge. Every screen must pass the Section 15 checklist before its phase can close.
- **Definition of done:** `lint`, `checkJs` type check, Vitest, pgTAP RLS tests the phase's Playwright tests on every device project, the no-horizontal-overflow check and the Section 15 and Section 16 screen checklists all pass; no unexplained `console.error`; `docs/ARCHITECTURE.md` and all required diagrams are updated.
- Required diagrams in `docs/architecture/`: (1) system/context architecture, (2) role and permission map, (3) database ERD, and (4) core workflow diagrams covering course approval, uploads, assignment submission, grade release/recalculation, and retention. One workflow diagram may be split into several readable diagrams. Use Mermaid source in the repository so diagrams remain version-controlled.
- For every critical business rule, document its enforcement layer: PostgreSQL constraint/trigger, RLS/Storage policy, trusted Edge Function, or UI-only presentation. Authorization, grade integrity, deadlines, retention and file validation must never rely on UI-only checks.
- Use a single file-validation architecture (D18) across every bucket. Do not add ad-hoc direct-to-Storage upload paths.
- Each phase must include tests for positive and negative authorization cases, idempotency where relevant, failure/retry behaviour, and audit coverage.
- **Grades are computed only by `calculate_course_grades`** (D30). No stored aggregates and no formulas in the frontend.
- **Stop and ask** if a requirement is not covered here. Never invent policy.
- **Phase protocol.** Every phase follows `CLAUDE.md`, `docs/PHASES.md` and `docs/TESTING.md`: plan, security tests first, build, run `npm run verify`, manual checks, evidence in `docs/acceptance/`, pull request, human approval, tag. Never start a phase until the previous phase's gate is signed off, and re-run all earlier suites in every phase.
- **Every change to Section 3** requires an ADR entry with date and reason.


## 10. Phase plan

Each phase is complete only when every item under Build is done, every Test passes, and the Exit gate is satisfied.


### Phase 0: Repository, environments and CI

**Build**

- Create the Git repository, branch protection (pull request and passing CI required), `CLAUDE.md`, `docs/BUILD_PLAN.md` (this document), `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, and version-controlled Mermaid diagrams: system architecture, role/permission map, database ERD, and workflow diagrams.
- Copy the documentation set (`CLAUDE.md`, `docs/`), `assets/brand/` and the prototype into the repository, and add the npm scripts listed in `docs/TESTING.md` (`lint`, `typecheck`, `test`, `test:db`, `test:e2e`, `lighthouse`, `verify`).
- Create Supabase projects for development and staging; reserve production. Initialise the Supabase CLI and a `supabase/migrations` folder.
- GitHub Actions: install, lint, `checkJs`, Vitest, pgTAP against a local Supabase, build, secret scan.
- Create Vercel projects with preview deployments for pull requests.

**Tests required**

- CI passes on the empty project and fails when a fake service-role string is added under `src/`.

**Exit gate (all must pass)**

- Inputs needed by Phases 0 to 2 are supplied; every other Section 4 input has a named owner and a due date matching the phase that needs it.
- Architecture diagrams reviewed and consistent with this build plan.
- CI green; branch protection active.

Git tag on completion: `phase-0-done`


### Phase 1: Frontend scaffold and design system

**Build**

- Vite + React (JavaScript), Tailwind, shadcn/ui, Lucide, React Router, Supabase client with the anon key.
- Layout shells for Administrator, Lecturer and Learner dashboards with the Section 15 navigation pattern: floating pill bar on phones (three destination icons plus More, name shown on the active item only, D40), collapsible side rail on tablets, persistent sidebar on desktop.
- Responsive foundation: Tailwind breakpoints as in Section 15, viewport meta with `viewport-fit=cover`, safe-area utilities, `100dvh` layout units, 16 px minimum input text, a `ResponsiveTable` component (table on wide screens, stacked cards on phones), a `ResponsiveChart` wrapper, and an in-app-browser notice.
- Feedback system (Section 16): toast provider (shadcn Sonner) behind a `useToast` wrapper that enforces durations, de-duplication, the maximum of 3 and Undo; `Fab` and `SpeedDial` components that appear only below 1024 px, respect safe areas, and hide on scroll and while the keyboard is open; shared skeleton components and a `useDelayedLoading` hook implementing the 150 ms and 300 ms rules.
- `UserAvatar.jsx`: uploaded image, then initials (first letter of first and second name, uppercase), then generic icon; falls back if the image fails to load.
- Brand assets and tokens: copy `assets/brand/` into `src/assets/brand/`; implement the tokens from `docs/DESIGN.md` (light and dark, Inter self-hosted), the `LogoMark` component (alpha mask, navy or white), the gölarae brand block component, the PWA icons and favicon, and the Google button component per D27.
- Error boundary, loading and empty-state components, PWA manifest with maskable icons and `apple-touch-icon`, installable shell, and an offline fallback page. The service worker caches the app shell only; it never caches API responses or private files.
- Vitest, React Testing Library and Playwright set up with the device projects listed in Section 15, plus Lighthouse CI on the mobile preset in GitHub Actions.

**Tests required**

- UserAvatar: Prince Boateng gives PB; Sarah gives S; no name gives generic icon; broken image falls back to initials.
- Playwright runs on every Section 15 device project. A no-horizontal-overflow test (document scroll width must not exceed viewport width) runs on every route at 320, 375, 768, 1024, 1280 and 1920 px, and a touch-target test confirms interactive elements are at least 44 by 44 px on phones.

**Exit gate (all must pass)**

- All layouts usable at every Section 15 width and orientation; overflow and touch-target tests green.
- Initials are computed in code, never stored.

Git tag on completion: `phase-1-done`


### Phase 2: Database foundation and security core

**Build**

- Migrations: enums, `profiles`, `system_settings` (seeded with all defaults), `audit_logs`, `notification_preferences`, and the initial `file_objects` registry schema or a migration explicitly scheduled before any upload feature.
- Define unique constraints, foreign keys, indexes, timestamp triggers, immutable history patterns and audit strategy. Keep critical rules enforced in PostgreSQL or trusted server functions, not only in UI.
- Trigger on `auth.users` creating a LEARNER, ACTIVE profile from the first name and second name supplied at email sign-up, or from the Google profile (given and family name); email sign-up is rejected if either name is empty, and a Google sign-up with a missing name sets `profile_completed` to false. The role is never taken from client data.
- SECURITY DEFINER helper functions with fixed `search_path`: `is_admin`, `is_lecturer_of`, `is_enrolled`.
- Column protection so `role`, `can_create_courses` and `account_status` cannot be changed by the user.
- Append-only audit logging; seed script with one administrator, two lecturers, three learners.

**Tests required**

- pgTAP: a learner cannot change own role or status; cannot read other profiles; cannot write or read audit logs; sign-up always yields LEARNER even if the client sends another role; a sign-up with an empty first or second name is rejected; a Google-style sign-up with no family name yields `profile_completed` = false; every ADMIN policy denies an AAL1 session.

**Exit gate (all must pass)**

- All pgTAP tests pass in CI.

Git tag on completion: `phase-2-done`


### Phase 3: Authentication

**Build**

- Pages and routes: `/` (to Sign In when signed out), `/login`, `/signup`, `/forgot-password`, `/reset-password`, email verification screen, loading and error states.
- Brand block directly below the Sign In and Sign Up forms (including the Google button): the gölarae logo, then directly beneath it the exact text "from gölarae", centred, nothing between them. The DDTC LMS logo sits above the form. Assets and rules are in D39.
- Supabase email-and-password and Google providers configured per environment. Sign In and Sign Up show Continue with Google per D27 (official button, "or" divider, full width), a Complete your profile screen for missing names, and refusal for ADMIN and LECTURER accounts. Before coding, Claude Code states the Supabase mechanism for D27 rules (4) and (5) and verifies which D32 session limits the plan enforces, and gets approval.
- Role-aware route guards and redirects to `/admin/dashboard`, `/lecturer/dashboard`, `/learner/dashboard`; signed-in users leaving auth pages are redirected.
- Suspended, deactivated and unverified handling; Resend SMTP with branded templates. (Turnstile CAPTCHA removed by the owner, 2026-11-05; see D22.)
- Admin MFA enrolment and enforcement.
- Authentication Loading State: a skeleton while the session is checked, with no flash of Sign In for a signed-in user and no flash of protected content for a signed-out user.
- Auth screens follow Section 15: single column on phones, correct `type`, `inputmode` and `autocomplete` values (including `current-password`, `new-password` and `one-time-code`), 16 px inputs so iOS does not zoom, the on-screen keyboard never hides the focused field or the submit button.

**Tests required**

- Playwright: register, verify, sign in, sign out, wrong password, reset password, suspended user refused, each role lands on the correct dashboard, signed-out visit to every protected route redirects to Sign In.
- Sign-up requires both names; a sign-up with a role in the request is still LEARNER; an unverified account cannot sign in until the email is verified; duplicate email and wrong-password messages do not reveal whether an address is registered; a self-registered user can never become ADMIN or LECTURER.
- Google (staging Google test accounts, plus a manual run on iOS 18 Safari): a new Google user becomes LEARNER; names are copied; a missing name forces Complete your profile; a Google sign-in with an ADMIN or LECTURER email is refused and links nothing; a verified-email match links to the existing LEARNER; an unverified match is refused; cancelling the Google prompt returns to Sign In with a clear message; inside an in-app browser the Open in Safari or Chrome notice appears instead of a failing Google screen.
- Auth screens render without overflow and with the brand line visible at 320, 375, 768 and 1280 px, in portrait and landscape, on iOS 18 Safari and Android Chrome.
- Visual check that the gölarae logo and the text "from gölarae" sit directly under both forms, logo above text, with nothing between, in light and dark.

**Exit gate (all must pass)**

- No protected data or route is reachable while signed out.
- Admin cannot reach the dashboard without MFA.
- Email sign-up, email verification, email sign-in and Continue with Google all work on staging on iOS 18 Safari, Android Chrome and desktop.

Git tag on completion: `phase-3-done`


### Phase 4: Profiles, user management and avatars

**Build**

- `profile-images` bucket and policies; image validation; upload and replace in Profile Settings.
- Administrator: user list with search and filters, suspend/reactivate/deactivate, `set-user-role`, `provision-lecturer`, course-creation permission toggle, and one-time bootstrap-administrator script with a written recovery procedure.
- Implement D32: session limits, session revocation on suspension and deactivation, `reset-admin-mfa`, and an audited recovery procedure. The bootstrap mechanism is disabled after successful provisioning, and the system refuses production launch checks unless two active ADMIN accounts exist.
- `bulk-import-learners` with preview and error report.
- User management and import preview use `ResponsiveTable`: stacked cards with avatar, name, role and status on phones; filters open in a bottom sheet.

**Tests required**

- A non-administrator cannot change any role at database, function and UI level.
- Avatar upload rejects wrong type and oversize; initials show when image is missing.
- Every administrator action produces an audit record.
- Idle and absolute session limits behave as D32 (using shortened test values); suspension revokes sessions; `reset-admin-mfa` is rate-limited and audited.
- Profile images use the D18 pipeline: a PENDING or REJECTED image is never shown, and replacing an image leads to removal of the old object.

**Exit gate (all must pass)**

- Bootstrap procedure documented and tested on staging.

Git tag on completion: `phase-4-done`


### Phase 5: Courses, lecturers and enrolment

**Build**

- Migrations for `courses`, `course_lecturers`, `course_enrollments` with the constraints in Section 5.
- `create-course`; lifecycle DRAFT, PENDING_APPROVAL, PUBLISHED, ARCHIVED per D04; archive keeps all records.
- Lecturer: My Courses, Create New Course when permitted, Course Editor, and workspace tabs (Overview, Lessons, Assignments, Learners, Gradebook, Analytics, Settings).
- Administrator can grant/revoke `can_create_courses`; revocation blocks creation only and does not remove current course assignments. Provide owner transfer, course lecturer management, and reassignment workflow when a lecturer is deactivated. Preserve all course history and data.
- Administrator: course oversight, approval queue, enrolment management (including marking enrolments COMPLETED).

**Tests required**

- Lecturer A cannot read or edit lecturer B's course; draft and pending courses are invisible to learners; duplicate course code and duplicate active enrolment are rejected; learner without enrolment sees nothing; a COMPLETED enrolment and an ARCHIVED course are read-only for learners as in D05 and D07.

**Exit gate (all must pass)**

- All course and enrolment pgTAP and Playwright tests pass.

Git tag on completion: `phase-5-done`


### Phase 6: Lessons and lesson audio

**Build**

- Migrations for `lessons`, `lesson_audio_files`, `lesson_attachments`, `lesson_progress`.
- Sanitised rich-text editor, drafts, publish, reorder.
- Upload pipeline (D18) and `lesson-audio` and `lesson-attachments` buckets with policies. Every uploaded resource must have a `file_objects` registry record; do not duplicate validation state across resource tables.
- Learner lesson page: audio player with play, pause, progress, current time, duration, Download Audio, previous and next, completion control, progress indicator.
- Mobile audio standard (Section 15): full-width player, 44 px controls, touch-draggable seek bar, playback speed 0.75x to 2x, Media Session metadata for lock-screen controls, `preload` set to metadata only, no autoplay, file size shown before download, and lesson content, images and tables that reflow without overflow.
- Audio replacement with SUPERSEDED history.
- ADR-007 (owner, 2026-11-07): up to 10 titled, ordered audio files per lesson (rename, move up and down); Delete for lesson audio, attachments and course covers after a confirmation, through the `delete-media` Edge Function only (record kept, file removed from Storage, failures retried by `cleanup-files`).

**Tests required**

- Enrolled learner streams and downloads; unenrolled learner, draft lesson, REJECTED or PENDING file and other lecturers are all denied at Storage level.
- Renamed non-audio file is rejected; oversize and over-duration files rejected.
- Archiving a course leaves audio intact.
- Manual check on the Section 15 real-device matrix, including playback with the screen locked, after a phone call interruption, on rotation, and download to the iPhone Files app.

**Exit gate (all must pass)**

- Playback and download work on all three devices.

Git tag on completion: `phase-6-done`


### Phase 7: Assignments and instruction audio

**Build**

- Migrations for `grade_categories`, `assignments`, `submission_extensions`.
- Assignment editor with all fields in Section 5, instruction-type validation (TEXT needs text; AUDIO needs audio; TEXT_AND_AUDIO needs both), category selection, publish.
- `assignment-instructions-audio` bucket, separate from lesson audio but using the same D18 registry and validation pipeline.
- Learner assignment list and due-date view.

**Tests required**

- Database CHECKs reject invalid instruction combinations; only the course's lecturers manage assignments; learners see only published assignments of enrolled courses; instruction audio is denied to everyone else.

**Exit gate (all must pass)**

- Category weights must total 100 before any grade can be released (tested).

Git tag on completion: `phase-7-done`


### Phase 8: Submissions and file validation

**Build**

- Migrations for `submissions`, `submission_versions`, `submission_files`.
- `submit-assignment` with the rules in D10; `learner-submissions` bucket and policies. Implement resumable/failed-upload recovery, duplicate request idempotency, and safe retry handling.
- `cleanup-files` job (pending-upload expiry after 24 hours, rejected objects, replaced images and covers) with alerts on failure.
- ADR-007 (owner, 2026-11-07): lecturers also record lesson audio in the app with the same recorder: at most 30 minutes per recording, several recordings per lesson within the limit of 10 audio files; longer lessons are recorded with the phone's own recorder and uploaded.
- Browser audio recording with MediaRecorder, preview before submit, format fallback for Safari, upload alternative if the microphone is denied or unsupported. Keep the screen awake while recording where Wake Lock is supported, warn that recording stops if the app is backgrounded, resume interrupted uploads after a network change, and keep text-answer drafts in local browser storage (cleared on submit and on sign-out).
- Text, audio, PDF and Word submission; extension management for lecturers.

**Tests required**

- A renamed .exe sent as .pdf is rejected; oversize and over-duration rejected; late and extension rules behave exactly as D10; resubmission blocked after GRADED; a learner cannot read, write or overwrite another learner's submission or files.
- Playwright covers recording, upload and each file type.

**Exit gate (all must pass)**

- Recording and playback verified on a real iPhone (iOS 18 Safari), a real Android phone (Chrome) and desktop; an upload interrupted by switching networks resumes.

Git tag on completion: `phase-8-done`


### Phase 9: Grading, feedback and history

**Build**

- Grading screen: read text, play audio, open documents, score, feedback, save draft, release.
- Trigger enforcing 0 <= score <= max_marks; `grade_change_history` written by trigger; reopen flow.
- `release-grades` per submission and per assignment; notifications on release. Any score/feedback change after release records prior and new values, reason, actor and timestamp, and notifies the learner; results update automatically because grades are computed on read (D30).
- Add a clear “Reopen grade” workflow with a required reason and immutable history; re-releasing updated grades follows D30.
- Assignment results dashboard built from `course_enrollments` left-joined to submissions, with search, sort, filter, counts (enrolled, submitted, graded, ungraded, missing) and avatars. On phones the table becomes cards and the grading screen stacks the submission above the grading panel with a sticky Save and Release bar; on tablets and desktops it is two panes.

**Tests required**

- A pending upload older than 24 hours is removed by `cleanup-files`, while lesson audio and VALIDATED submission files are untouched.
- Out-of-range scores rejected; every grade or feedback change appears in history; learners see nothing before release and never another learner's grade; learners who never submitted appear in results as missing.

**Exit gate (all must pass)**

- Counts always add up to the enrolled total (tested).

Git tag on completion: `phase-9-done`


### Phase 10: Gradebook, distribution charts and exports

**Build**

- Separate lecturer, learner and administrator gradebook views using D11–D16. Lecturer sees identifiable results only for their courses; learners see their own detailed results only; administrator access is audited.
- Implement D11 and D13 exactly, through the single database function `calculate_course_grades` (D30), used by all screens and exports; never recalculate formulas in frontend components.
- Display missing, submitted-ungraded, graded-draft, released, late, and counted-as-zero states distinctly. Future assignments and ungraded submitted work must not be treated as zero.
- Category weights total exactly 100 before first release; thereafter lock them except through the audited administrator workflow in D13/D30.
- Score distribution bar chart per graded assignment: horizontal axis Percentage scored, vertical axis Number of learners, count shown on each bar, learner's own band highlighted, band shown separately from any rank, minimum class-size rule from D15, text summary for accessibility.
- Class average, highest, lowest, graded, ungraded and missing counts; ungraded excluded from calculations. Show provisional/final state and “Not yet available” when there are no eligible items.
- Learner gradebook shows current and completed courses, released historical grades/feedback and progress summaries. Lesson completion remains separate from academic marks. Learners never see class-level individual results or exact ranks; class statistics are suppressed below `min_class_size`.
- Responsive gradebook and charts per Section 15: a scrollable matrix with a sticky learner column on tablets and desktops, a per-learner card view on phones, charts that resize without overlapping labels, tap-to-show values, patterns as well as colours, and the text summary always visible.
- `export-gradebook` CSV and XLSX with audit record.

**Tests required**

- Fixture data with known marks yields exact expected percentages, bands, averages and overall grades; a score of 73/100 shows 73% in 70-79%; boundary values 49.9, 50, 89.9 and 100 land in the correct band; editing a grade updates statistics; a learner cannot query or export others' marks.
- D13 edge cases: an early-submitted assignment counts once its grade is released; a future assignment with no released grade is excluded; with `missing_as_zero` on, an overdue missing assignment counts as 0 and a late submission lifts the zero until its grade is released; an extension moves the effective due date; an unpublished assignment with released grades still counts and one without does not; Final and Provisional status and "Not yet available" are correct; changing category weights after first release is refused outside the audited workflow.

**Exit gate (all must pass)**

- Chart counts equal the authorised dataset in every test.

Git tag on completion: `phase-10-done`


### Phase 11: Notifications, reports, audit viewer and settings

**Build**

- Notification centre and preferences; emails through `send-notification-email` for the events in D21. Implement the delivery worker, retry schedule, reminder scheduler and deduplication in D31 and Section 8, using `notification_deliveries`.
- Administrator dashboard: active learners, lecturers, courses, pending approvals, active enrolments, recent submissions, grading backlog, recent grade releases, and recent administrative/security events.
- Lecturer dashboard: courses owned/taught, pending approval, ungraded submissions, upcoming deadlines, course performance summaries, and quick gradebook/course creation actions.
- Learner dashboard: current and completed courses, upcoming deadlines, missing/submitted work, recent released grades, and lesson progress.
- Administrator reports (enrolment, activity, completion, grade summaries) and audit log viewer with filters.
- Settings screen exposing every `system_settings` value with validation and audit.
- All dashboards, the notification centre, reports and the audit viewer follow Section 15 (cards, bottom sheets, no overflow).

**Tests required**

- Notifications reach only their recipient; audit viewer is administrator-only; changing a setting takes effect and is audited.
- Retry schedule of 1, 5, 15, 60 and 240 minutes then FAILED with an alert; permanent failures are not retried; duplicate events create one notification; changing a deadline or extension replaces the pending reminder.

**Exit gate (all must pass)**

- Due-date reminder fires once, 24 hours before the effective due date.

Git tag on completion: `phase-11-done`


### Phase 12: Assignment-audio retention

**Build**

- Migrations for `retention_holds` and `retention_runs`; hold management screen for administrators.
- `retention-runner` via `pg_cron`, implementing D20 exactly; dry-run mode default; deletes one object at a time by exact stored path; sets `file_objects.status` to DELETED or DELETE_FAILED; records every outcome; safe retries.

**Tests required**

- On staging with `retention_days` set to 0 and seeded fixtures, only eligible learner-submitted audio is deleted; production keeps `retention_days` at 180.
- Never deletes lesson audio, instruction audio, attachments, text, PDF or Word files (the files of lesson audio and attachments that a lecturer or administrator deleted are removed by `delete-media` and `cleanup-files`, ADR-007, not by this job); never deletes ungraded, unreleased, held or too-recent files; submission, grade and history rows survive; failed deletions are logged and retried; dry-run changes nothing.

**Exit gate (all must pass)**

- Retention stays disabled (`retention_enabled` = false) until after Phase 14 review.

Git tag on completion: `phase-12-done`


### Phase 13: Hardening, accessibility, performance and recovery

**Build**

- Line-by-line review of every RLS and Storage policy against Section 7, including direct-ID tampering, cross-course access, signed URL expiry, unpublished resources, invalid file states, and attempts to alter role/score/deadline through direct API calls.
- Dependency audit, security headers and CSP, secret scan, rate-limit review.
- Accessibility to WCAG 2.1 AA: axe in Playwright, keyboard-only pass, screen-reader pass on forms, audio controls and charts.
- Indexes for results and gradebook queries, pagination everywhere, load test with realistic class sizes.
- Meet the Section 15 performance budgets on a throttled mid-range Android profile; Lighthouse CI thresholds enforced; run the full real-device matrix; screen-reader pass with VoiceOver on iPhone and TalkBack on Android.
- Daily database backups plus scheduled Storage backup; error monitoring and uptime alerts. Document the approved D34 values; alert on failed backup, restore, upload cleanup, retention or email delivery jobs.

**Tests required**

- Restore drill on staging: restore database and Storage, verify object/database consistency, then run the acceptance journey; all suites green. Record duration and data-loss window against the D34 RPO and RTO.

**Exit gate (all must pass)**

- No high-severity findings open.
- Restore drill documented and successful.

Git tag on completion: `phase-13-done`


### Phase 14: Staging acceptance and production release

**Build**

- Run the self-contained acceptance journey in Section 11 of this build plan on staging, using the Section 15 real-device matrix, with each role's journey run on at least one phone, one tablet and one desktop, and screenshots saved as evidence. Do not depend on Section 24 of an earlier brief.
- Pilot with a small group of real lecturers and learners using test courses.
- Production: apply migrations, create buckets and policies from code, configure Auth, SMTP and MFA (no CAPTCHA, D22), run the bootstrap procedure, deploy over HTTPS, verify environment variables.
- Runbook: backup and restore, adding/deactivating a lecturer, course-owner transfer, changing settings, administrator recovery, email delivery failures, pending-upload cleanup, enabling retention, second-administrator and MFA reset procedure, incident response and escalation contacts.

**Tests required**

- Acceptance journey passes on staging and again on production; production smoke tests pass; rollback tested.

**Exit gate (all must pass)**

- Written sign-off in `docs/DECISIONS.md`.
- Real-device matrix completed with no open layout, audio, recording, download or sign-in defects.
- Retention stays in dry-run for the first 30 days.

Git tag on completion: `v1.0.0` (the release version, independent of this document's version)


## 11. Self-contained acceptance journey

Run this complete end-to-end journey in staging before production, and repeat the applicable smoke checks after deployment. Record evidence and pass/fail for every step. Use seeded test accounts for all three roles and real mobile devices for media tests.

1. Register a learner by email; verify the email; sign in; confirm no course is visible before enrolment.
2. Register a learner by email; verify the email; test first sign-in, wrong password, duplicate email, password reset and unverified-email handling. Then test Continue with Google on Sign In and Sign Up (new account, existing learner, ADMIN or LECTURER email refused, missing name, cancelled prompt). Confirm a self-registered user can never become ADMIN or LECTURER.
3. Sign in as administrator with MFA; verify AAL1 is denied for every privileged operation; test the D32 idle and absolute timeouts, sign-out, suspension, deactivation, `reset-admin-mfa` and the documented recovery procedure.
4. Administrator provisions a lecturer and toggles course-creation permission; lecturer without permission is denied creation; granting permission enables creation.
5. Lecturer creates a course, adds a co-lecturer, submits for approval; learner cannot see it before approval; administrator returns it with reason and then approves it.
6. Revoke the owner’s course-creation permission and verify existing course access remains; transfer ownership and verify all course records and permissions remain correct.
7. Lecturer creates and reorders lessons, text content, multiple audio versions and attachments; test validated playback/download and denial for unpublished, pending, rejected, un-enrolled and cross-course access.
8. Lecturer publishes an assignment with text/audio instructions, category, maximum marks and due date; verify assignment snapshots and change warnings.
9. Learner submits text, records audio, uploads audio and uploads PDF/DOCX; test file signatures, limits, retries, duplicate requests, version history, late policy and extensions. Verify no learner can read or overwrite another learner’s files.
10. Lecturer grades and releases one submission and a whole assignment; learner sees nothing before release and sees score, percentage, band and feedback after release.
11. Change a released grade with a reason; verify immutable grade history, audit log, recalculated gradebook/chart, and learner notification.
12. Verify grade calculations with fixtures covering missing-as-zero on/off, future assignments, submitted-but-ungraded work, weighted categories, rounding, empty categories and band boundaries. Verify exports match the on-screen server-calculated values.
13. Verify notification deduplication, due-date reminders, changed deadlines, email preferences, provider failures and retry behaviour.
14. Run retention in dry-run; verify no file is deleted. On staging set `retention_days` to 0 with seeded fixtures and test holds, eligibility, failed deletion and retry; confirm only eligible learner-submitted audio is removed. Restore the production values (`retention_days` 180, `retention_enabled` false) and verify them.
15. Test profile and course-cover uploads, account deactivation, archive behaviour, audit/report permissions, backup restore, accessibility, responsive layouts and production rollback.

Acceptance passes only when all expected allow/deny cases pass, the test evidence is saved in `docs/acceptance/`, and DDTC signs off in `docs/DECISIONS.md`.

## 12. Session prompt for every phase

> Read `CLAUDE.md`, `docs/BUILD_PLAN.md`, `docs/DECISIONS.md` and `docs/ARCHITECTURE.md`. We are starting Phase N. Write a plan listing the migrations, files, policies and tests you will create, and wait for my approval. Write the allow and deny tests for every role before the feature code. Do not begin Phase N+1. When finished, run the full test suite and show the exit-gate checklist with pass or fail for each item.


## 13. Production readiness, privacy and operational controls

Before production release, the team must complete and document all of the following:

- Privacy/legal review of data collected, purpose, access, retention, correction requests, account deactivation, security incidents, backups and any legally required erasure/anonymization. DDTC's responsible adviser determines applicable Ghanaian and other relevant legal obligations; developers must not invent legal conclusions.
- A documented retention schedule by data class: account/profile data, authentication data, academic records, submissions, audio files, audit/security logs, notifications, backups and temporary uploads. Exceptions/holds must be supported and audited.
- RPO, RTO, backup retention and restoration test cadence per D34, or DDTC-approved alternatives. Backups are encrypted and access-restricted; restore checks verify both database rows and Storage objects.
- Security incident response: detection, triage, containment, evidence preservation, responsible contacts, communication and recovery. Do not expose secrets or sensitive learner data in logs.
- Operational monitoring/alerts for availability, server errors, repeated auth failures, email queue failures, upload validation/cleanup failures, backup failures, storage quota, scheduled jobs and retention failures.
- Production rollback procedure covering frontend deployment, database migration compatibility, configuration rollback and feature disablement. Destructive migrations require a tested backup and explicit approval.
- No production credentials or personal learner data in source control, sample fixtures, CI logs, screenshots or development seed data.

## 14. Acceptance and change control

When DDTC accepts this document, add `BUILD_PLAN v1.5 accepted — YYYY-MM-DD` with the date to `docs/DECISIONS.md`. Acceptance means all decisions in Section 3 and all mandatory release gates are accepted. Only a written Architecture Decision Record (ADR) may change Section 3. Each ADR must state the decision, reason, impact on schema/security/data migration, tests, rollout and rollback.

Do not begin production release while any blocker in Section 4 remains unresolved. Items may be marked “not applicable” only with a written reason and approval. Future features in Section 2 are not implied commitments for this release.


## 15. Responsive and device support standard

This section applies to every screen in every phase. A screen is not finished until it passes the checklist at the end.

### 15.1 Breakpoints and layout

| Class | Width | Layout |
|---|---|---|
| Phone | below 640 px | One column. Floating pill bar with three destination icons plus More (D40); the active item shows its name. Top bar with page title and avatar menu. Forms and filters in full-screen sheets or bottom sheets. |
| Tablet | 640 to 1023 px | One or two columns. Collapsible side rail. Tables allowed when all columns fit; otherwise cards. |
| Desktop | 1024 px and above | Persistent sidebar, multi-column content, full tables, two-pane grading. Content width capped at 1280 px for reading. |

- Tailwind default breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280) are used. Styles are written mobile-first, then enlarged.
- Minimum supported width is 320 px. Portrait and landscape both work; rotating must not lose form input or interrupt audio playback.
- Use relative units (`rem`, `%`, `dvh`). Never use `100vh` for full-height layouts; use `100dvh`. Respect safe areas with `env(safe-area-inset-*)` for notches, rounded corners and the home indicator, especially for the bottom tab bar and sticky action bars.
- Browser text zoom to 200% and page reflow at 320 px wide must not break any screen.

### 15.2 Screen patterns

| Screen | Phone | Tablet and desktop |
|---|---|---|
| Sign In, Sign Up, recovery | Single column, full-width buttons, brand line directly below the form | Centred card, same order, brand line directly below the form |
| Dashboards | Stacked summary cards, horizontal quick actions | Grid of cards, side-by-side panels |
| Lists and tables (users, courses, results, enrolments) | Stacked cards showing avatar, name, status and the key value; search and filters in a bottom sheet; 20 items per page | Full table with sortable columns, inline filters |
| Course workspace tabs | Horizontally scrollable tab bar or a select menu | Full tab bar |
| Lesson page | Content first, full-width audio player, Previous and Next at the bottom, completion button reachable with one thumb | Content with side panel for progress and lesson list |
| Assignment submission | One step at a time: instructions, response type, preview, submit; sticky Submit bar | Single page with all steps visible |
| Grading screen | Submission above, grading panel below, sticky Save and Release bar | Two panes: submission left, marks and feedback right |
| Gradebook | Per-learner card view with an expandable assignment list | Scrollable matrix with sticky learner column and header row |
| Charts | Full-width, labels shortened or rotated without overlap, tap to show a value, text summary always visible | Wider chart with all labels and the same text summary |
| Dialogs and forms | Full-screen sheets, one column, 16 px inputs | Centred dialogs, two columns where it helps |
| Notifications | List of cards, swipe-free (buttons only) | List with side detail |

### 15.3 Touch, forms and keyboard

- Every tappable element is at least 44 by 44 px with 8 px spacing. No feature depends on hover, double-tap, swipe-only or drag-only actions.
- All text inputs use at least 16 px text so iOS Safari does not zoom. Use the correct `type`, `inputmode` and `autocomplete` values. Labels are always visible; placeholders are never the only label.
- The on-screen keyboard must never hide the focused field, an error message or the submit button; the page scrolls to keep them visible.
- Disable a submit button only while a request is in flight, and show progress. Never lose typed input on error, rotation or a dropped connection.

### 15.4 Audio, recording, files and downloads

- Player: full width, play and pause, touch-draggable seek bar, current time and duration, speed 0.75x to 2x, Media Session metadata for lock-screen controls, no autoplay, `preload` limited to metadata. Audio keeps playing when the screen locks and survives rotation.
- Download shows the file size first and behaves correctly on iPhone (saves to Files) and Android. A failed download shows a clear retry message.
- Recording: needs HTTPS and a user tap; keep the screen awake where supported; warn that backgrounding stops recording; preview before submit; fall back to file upload if the microphone is denied or unsupported. Safari and Chrome record in different formats and both must play back on every device.
- Uploads show progress, resume after a network change or app suspension, and work from the phone's file picker, Files app and voice recordings.
- PDFs and Word files open in a new tab or download; they are never forced inline in a way that traps the user.

### 15.5 Performance and low bandwidth

- Budgets measured with Lighthouse mobile preset and a throttled mid-range Android profile: Sign In and learner dashboard LCP at or below 2.5 s, CLS at or below 0.1, INP at or below 200 ms, initial JavaScript for the Sign In route at or below 200 KB gzipped. Lighthouse performance score at least 80 and accessibility at least 95 on Sign In, learner dashboard, lesson page, assignment page and gradebook.
- Code-split by route; lazy-load charts and the rich-text editor; serve images as WebP with `srcset` and lazy loading; avatar images are small thumbnails; paginate every list.
- Show an offline banner when the connection drops and retry safely. The service worker caches the app shell only; private data and files are never cached by it.
- Never download audio automatically; the learner chooses to stream or save it.
- Respect `prefers-reduced-motion`. Colour contrast meets WCAG 2.1 AA, and information is never conveyed by colour alone.

### 15.6 In-app browsers

Links opened inside WhatsApp, Facebook, Instagram or TikTok browsers often block microphone access, downloads and sign-in (Google refuses to sign in inside them). The app detects these and shows a clear banner with instructions to open the page in Safari or Chrome. The banner never blocks the page.

### 15.7 Test matrix

Automated (Playwright and CI):

| Project | Engine | Viewport |
|---|---|---|
| Desktop Chrome | Chromium | 1280 by 720 |
| Desktop Firefox | Firefox | 1280 by 720 |
| Desktop Safari | WebKit | 1280 by 720 |
| Laptop and Full HD | Chromium | 1440 by 900 and 1920 by 1080 |
| iPhone SE | WebKit | 375 by 667 |
| iPhone 15 | WebKit | 393 by 852 |
| Small Android | Chromium | 360 by 640 |
| Pixel 7 | Chromium | 412 by 915 |
| iPad (gen 7) | WebKit | 810 by 1080, portrait and landscape |
| Minimum width | Chromium | 320 by 568 |

Playwright WebKit and device emulation do not replace real devices. Audio, recording, downloads, sign-up and the on-screen keyboard are verified manually on real hardware.

Real devices before launch (record device, OS and browser version for each):

- An iPhone on iOS 18 Safari (primary) and an iPhone on iOS 17 Safari.
- An iPad on Safari, portrait and landscape.
- A mid-range Android phone on Chrome.
- A Windows laptop on Chrome and Edge, and a Mac on Safari.
- At least one test on a slow or throttled mobile connection.

### 15.8 Per-screen checklist (definition of done)

1. No horizontal page scrolling from 320 to 1920 px, in portrait and landscape.
2. Touch targets are at least 44 by 44 px; inputs are 16 px or larger.
3. The keyboard never hides the focused field or the main action.
4. Tables become cards on phones; wide data scrolls only inside its own container.
5. Safe areas and `dvh` are respected on iPhone.
6. Loading, empty, error and offline states exist and fit the screen.
7. Keyboard navigation and VoiceOver or TalkBack work; focus order is logical; contrast meets AA.
8. The screen meets the performance budget in 15.5.
9. Playwright passes on every device project, with a screenshot saved for 375, 768 and 1280 px.
10. Loading shows the matching skeleton from the Section 16 skeleton table, with the 150 ms and 300 ms timing and no layout shift above 0.1.
11. Every action listed in the Section 16 toast catalogue shows its toast, and no unlisted toast exists.
12. A floating action button appears only where the Section 16 FAB table lists it, and only below 1024 px.


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
