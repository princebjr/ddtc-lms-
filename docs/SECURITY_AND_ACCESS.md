# DDTC LMS: Security, access and trusted functions

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## Sign-in, upload and session decisions

| ID | Topic | Final decision |
|---|---|---|
| D18 | Upload pipeline | Every uploaded file type uses one consistent three-step pipeline: `register-upload` checks authorization and creates a PENDING `file_objects` row with a server-generated immutable path; the browser uploads only to that path; `finalize-upload` verifies actual file signature/magic bytes, MIME, size, duration where applicable, file-specific constraints and ownership, then sets VALIDATED or REJECTED. Resumable upload is required for files over 25 MB. Storage reads require a matching VALIDATED file record plus the resource-specific access rule. Rejected objects are removed; removal failures are recorded and retried. Pending uploads expire after 24 hours and are cleaned by a scheduled job. Never trust client-provided paths, MIME type, size, duration, user ID or resource ownership. |
| D19 | Downloads and streaming | Signed URLs are created in the browser with the signed-in user's own session using Supabase Storage `createSignedUrl`. Storage policies authorise each request by joining `file_objects` (status VALIDATED) with the resource rule in Sections 6 and 7. No Edge Function and no service-role credential is used for playback or download. Expiry: 3600 seconds for playback, 300 seconds for download. The download option uses `safe_download_filename`. New URL requests from a suspended or deactivated user are denied at once; a URL already issued stays valid until it expires (at most one hour), which is an accepted and documented risk. |
| D22 | Authentication | Learners: email and password (minimum 8 characters, email verification required; owner change 2026-11-05, was 10; applies to every account) or Continue with Google. Administrators and lecturers: email and password only. TOTP MFA required for ADMIN, and every ADMIN policy requires an AAL2 session. No CAPTCHA (owner change 2026-11-05: Cloudflare Turnstile removed because it slowed sign-in; Supabase Auth rate limits per IP still apply). Sign-in error messages never reveal whether an email address is registered. |
| D27 | Continue with Google | Offered on both Sign In and Sign Up, for learners only. (1) The button uses Google's official branding (G mark, "Continue with Google", light and dark variants), full width, below the main button with an "or" divider. (2) Supabase Google provider with the scopes `openid email profile` only; only Google accounts whose email is verified are accepted; no verification email is sent. (3) A new Google account becomes LEARNER and ACTIVE through the same database trigger as email sign-up; role is never accepted from client data. First and second name are copied from the Google profile; if either is empty, a required Complete your profile screen collects them before any dashboard opens (`profiles.profile_completed`). (4) A Google sign-in whose verified email matches an existing ADMIN or LECTURER is refused with a clear message and links nothing; administrators and lecturers cannot add Google as a sign-in method. (5) A Google sign-in whose verified email matches an existing LEARNER with a verified email links to that account; if that account's email is unverified, sign-in is refused and the user is asked to verify first. (6) The Google profile photo is not imported; the learner shows initials until they upload a photo through D18. (7) The OAuth consent screen shows the name DDTC LMS, the DDTC logo, a support email and public links to the privacy notice and terms, and its publishing status is In production before launch. (8) Google blocks sign-in inside embedded in-app browsers (WhatsApp, Facebook, Instagram, TikTok), so the app shows the Open in Safari or Chrome notice. (9) Each environment (development, staging, production) has its own OAuth client and redirect URL. (10) Phase 3 must state the Supabase mechanism used for (4) and (5) and prove both with tests. Email and password remains available to every learner. |
| D32 | Sessions and recovery | ADMIN accounts require TOTP MFA and an AAL2 session for every privileged operation. Session limits: ADMIN idle timeout 30 minutes and absolute lifetime 12 hours; LECTURER idle 8 hours and absolute 7 days; LEARNER idle 7 days and absolute 30 days. Phase 3 verifies what the Supabase plan enforces and implements any limit the platform cannot enforce with a server-side check for ADMIN and a client timeout for others, documented in the phase plan. Suspension and deactivation revoke all sessions. Password recovery is by email link. At least two active ADMIN accounts must exist before production. A lost MFA device is reset by the other ADMIN through the `reset-admin-mfa` function (requires AAL2, rate-limited, audited); if no other ADMIN is available, the owner-controlled recovery procedure in the runbook applies and is audited afterwards. Bootstrap access is one-time and disabled after initial setup. |
| D33 | File registry | Every uploaded object has exactly one `file_objects` row, whose `status` is PENDING, VALIDATED, REJECTED, DELETED or DELETE_FAILED. Resource-level lifecycle (for example SUPERSEDED, ARCHIVED) lives only on the resource tables, never on `file_objects`. Resource tables reference `file_object_id` and never duplicate validation state or store raw storage paths. All file types, including instruction audio, profile images and course covers, use D18. |

## 7. Access rules (enforced by RLS and Storage policies)

| Resource | Administrator | Lecturer | Learner |
|---|---|---|---|
| Profiles | Read all; change role and status only through Edge Functions; nobody changes an ID number (ADR-008) | Read own; read learners of own courses (name, avatar and ID number, through `course_roster`) | Read and edit own permitted fields only (the ID number is read-only) |
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
- `register-upload` and `finalize-upload`: the validated upload pipeline in D18. For lesson audio, `register-upload` refuses an eleventh file before any upload unless it replaces one (ADR-007); the database checks again.
- `delete-media` (ADR-007): administrators and the course's lecturers delete a lesson audio file (in use or history), a lesson attachment or a course cover. The trusted database function (`lesson_audio_delete`, `lesson_attachment_delete`, `course_cover_remove`; service role only) re-checks the actor and the course, refuses archived courses, takes the item out at once and keeps its record with who and when (audited); the function then removes the file from Storage and marks it DELETED, or DELETE_FAILED for `cleanup-files` to retry. No client role has a DELETE privilege on these tables or a DELETE policy on these buckets.
- `manage-lessons`: saves (HTML cleaned against an allow-list), publishes and reorders lessons, and renames and reorders a lesson's audio files, through service-role-only database functions that re-check the actor and course.
- `submit-assignment`: checks enrolment, publication, due date, extensions, version rules; creates the version and sets lateness from server time.
- `release-grades`: releases one submission or a whole assignment; writes notifications and audit.
- `export-gradebook`: checks the caller's rights over the course; returns CSV or XLSX; writes audit.
- `retention-runner`: invoked by `pg_cron`; implements D20 exactly, dry-run first; writes `retention_runs` and audit.
- `send-notification-email`: worker run every minute by `pg_cron`; sends due `notification_deliveries` through Resend, respecting preferences, using the retry schedule in D31.
- `schedule-reminders`: run every 15 minutes by `pg_cron`; creates 24-hour due-date reminders with the deduplication key in D31.
- `cleanup-files`: run hourly by `pg_cron`; removes expired PENDING uploads (older than 24 hours), REJECTED objects, replaced or removed profile images and covers, and the files of lesson audio and attachments that were deleted (ADR-007); retries DELETE_FAILED; records outcomes and audit; never touches lesson audio or attachments in use, audio history, instruction audio or VALIDATED submission files.
- `reset-admin-mfa`: administrator only; resets another administrator's MFA factor under D32.
- Database function `calculate_course_grades` (SQL, read-only): the only place grade formulas exist (D30).
