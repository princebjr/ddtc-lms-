# DDTC LMS: Production readiness and runbook

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 13. Production readiness, privacy and operational controls

Before production release, the team must complete and document all of the following:

- Privacy/legal review of data collected, purpose, access, retention, correction requests, account deactivation, security incidents, backups and any legally required erasure/anonymization. DDTC's responsible adviser determines applicable Ghanaian and other relevant legal obligations; developers must not invent legal conclusions.
- A documented retention schedule by data class: account/profile data, authentication data, academic records, submissions, audio files, audit/security logs, notifications, backups and temporary uploads. Exceptions/holds must be supported and audited.
- RPO, RTO, backup retention and restoration test cadence per D34, or DDTC-approved alternatives. Backups are encrypted and access-restricted; restore checks verify both database rows and Storage objects.
- Security incident response: detection, triage, containment, evidence preservation, responsible contacts, communication and recovery. Do not expose secrets or sensitive learner data in logs.
- Operational monitoring/alerts for availability, server errors, repeated auth failures, email queue failures, upload validation/cleanup failures, backup failures, storage quota, scheduled jobs and retention failures.
- Production rollback procedure covering frontend deployment, database migration compatibility, configuration rollback and feature disablement. Destructive migrations require a tested backup and explicit approval.
- No production credentials or personal learner data in source control, sample fixtures, CI logs, screenshots or development seed data.

## Runbook contents to write in Phase 14

- Backup and restore for database and files, with the quarterly restore drill.
- Adding a lecturer, changing settings, enabling and disabling retention.
- Administrator MFA reset and the second-administrator recovery procedure.
- Google OAuth: where the client IDs and secrets live, how to rotate them, how to check the consent screen is In production.
- Incident contacts and escalation; rollback steps for a bad release.

## Written in Phase 4

### Bootstrap: the first administrator (D32)

Run once per environment, by the owner, on their own machine. The service-role key comes from the
Supabase dashboard (Project Settings, API Keys) and is set in the shell only; it is never typed as an
argument, pasted into chat, or committed.

```powershell
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role or secret key>'
node scripts/bootstrap-admin.mjs --email <owner email> --first <first name> --second <second name> --app <app address>
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

- An existing account is promoted; a new address gets an invitation email to choose a password.
- The database function `bootstrap_first_admin` refuses if any administrator exists, and sets
  `bootstrap_completed` after it succeeds, so the bootstrap cannot be used again. Every run is audited
  (`admin.bootstrap`).
- Then: sign in, set up two-step verification (the app requires it), and add the second administrator
  in the app (Users, Invite administrator; ADR-003). They accept the email invitation, choose a password
  and enrol two-step verification; they count towards the two-administrator rule once they accept.
- Production launch is refused while fewer than two administrators are active
  (`public.launch_readiness()`; the administrator dashboard also warns).

### Lost authenticator: administrator MFA reset (D32)

1. Normal case: another active administrator opens Users, the person's panel, Reset two-step
   verification. The function `reset-admin-mfa` checks the caller (AAL2, not themself), allows at most
   3 resets per hour per administrator, removes every authenticator of the person, signs them out
   everywhere and audits `admin.mfa_reset`. The person signs in again and enrols a new authenticator.
2. No other administrator can act (owner-controlled recovery): the owner signs in to the Supabase
   dashboard for the environment, Authentication, Users, the administrator, removes the MFA factors,
   and records what was done, when and why in the incident log. Then the administrator signs in and
   enrols again. Afterwards, add a second active administrator as soon as possible.

### Account actions (D02, D03, D32)

- Roles, course-creation permission and account status change only through `set-user-role`
  (administrator with AAL2). An administrator cannot change their own role or status, so the last
  active administrator can never be removed by mistake.
- Suspension and deactivation sign the person out everywhere at once (sessions deleted; an access
  token already issued is refused by RLS and expires within 10 minutes, D43). Reactivation restores access.
- Promoting a learner to lecturer or administrator removes any Google sign-in from the account (D27).

### Scheduled jobs

`cleanup-files` runs every hour at minute 17 (`cron.job` name `cleanup-files-hourly`). It reads the
project URL and the service-role key from Supabase Vault at run time. Add both once per environment
(SQL editor, as the owner); until then the job does nothing:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role key>', 'service_role_key');
```

Each run deletes expired PENDING uploads (24 h), REJECTED objects and replaced profile photos, retries
DELETE_FAILED, and audits a summary (`files.cleanup`). It never touches lesson audio, instruction
audio, attachments or submission files.

## Written in Phase 7

### Idle sign-out and the access-token lifetime (D43, ADR-011)

- The app signs every role out after `idle_timeout_minutes` (default 10) without activity, warned
  `idle_warning_seconds` (default 120) before. Administrators' sessions are also refused by the
  database after the same idle time (`is_admin()`).
- Access tokens must last 10 minutes in every environment. Local: `supabase/config.toml`
  (`jwt_expiry = 600`). Staging and production, once per project, as the owner: Supabase dashboard,
  Project Settings, JWT Keys (older dashboards: API, JWT Settings), set the access token expiry (JWT
  expiry limit) to 600 seconds and save. Do not use `supabase config push` for this: it would also
  push the local site URL and redirect addresses.
- Check it: sign in on the deployed app, then in the browser's developer tools read the
  `sb-...-auth-token` entry in Local Storage: `expires_in` is 600.
- Changing the idle limit before the Settings screen (Phase 11): SQL editor, as the owner,
  `update public.system_settings set value = '15' where key = 'idle_timeout_minutes';` (whole
  minutes, 5 to 60; the warning `idle_warning_seconds` takes 30 to 180). The database refuses other
  values and audits the change. Everyone's next page load uses the new value.


## Written in Phase 8

### Answers, files and the cleanup job (D10, D18, ADR-013)

- A learner's files wait on the server until they press Submit. A file never sent is removed by
  `cleanup-files` 24 hours after upload; files of submitted answers are never removed (until Phase
  12 retention, which is off by default).
- Files that fail to be removed three times or more: SQL editor, as the owner,
  `select id, bucket_name, storage_path, delete_attempts, last_delete_error from public.file_objects
  where delete_attempts >= 3 and status <> 'DELETED' order by updated_at desc;` (an administrator
  with two-step verification gets the same list from `public.cleanup_failures()`). Phase 11 turns
  this into an administrator alert. A file stuck in `DELETE_FAILED` is retried every hour; if
  Storage keeps refusing, remove the object in the dashboard (Storage, the bucket, the path) and
  the next run marks it `DELETED`.
- A learner's extension cannot be deleted, only taken back (kept with who and when). To see the
  history of one learner's extensions: `select extended_due_at, reason, granted_by, revoked_at,
  revoked_by from public.submission_extensions where assignment_id = '<id>' and learner_id = '<id>'
  order by created_at;` and the audit log rows `extension.granted`, `extension.changed` and
  `extension.removed`.

### Recording does not start (support)

- The browser must be allowed to use the microphone, and the app must be opened over HTTPS (any
  staging or production address is).
- iPhone (Safari): when asked, tap Allow. If it was refused: Settings, Safari, Microphone, Ask or
  Allow; or in Safari, the "aA" menu, Website Settings, Microphone, Allow. Then reload the page.
- Android (Chrome): the padlock or settings icon next to the address, Permissions, Microphone,
  Allow; or Chrome settings, Site settings, Microphone. Then reload the page.
- Desktop browsers: the icon at the left of the address bar, Microphone, Allow; check the system's
  microphone settings too.
- Recording pauses when the learner leaves the app or locks the phone (phones stop the microphone in
  the background). Long answers: record with the phone's own voice recorder and upload the file
  (Upload, Upload audio); MP3, M4A, WAV, WebM and Ogg are accepted up to 10 minutes and 25 MB.

## Written in Phase 9

### Grades, release and history (D12, D16, D30, ADR-014)

- "Category weights must total 100 before grades can be released": the course's lecturer opens the
  course's Assignments tab, Categories, and makes the weights add up to 100 (D12). Release then works.
- What a learner sees is the released grade only. After a lecturer changes a released grade (a reason
  is required), the learner keeps seeing the released one until the lecturer presses Release grade
  again; the learner then gets "Grade updated" and sees "Updated" on the grade.
- A grade's full history (every save, release and reopening, with who, when and why): the lecturer
  sees it under the grading panel ("Grade history"). In the SQL editor, as the owner:
  `select h.event, h.previous_score, h.new_score, h.reason, p.first_name || ' ' || p.second_name as by_whom,
  h.changed_at from public.grade_change_history h join public.profiles p on p.id = h.changed_by
  join public.submissions s on s.id = h.submission_id where s.assignment_id = '<assignment id>'
  and s.learner_id = '<learner id>' order by h.changed_at;` The history cannot be changed or deleted,
  by anyone; a mistaken grade is corrected by a new change with its reason.
- Audit records: `grade.saved`, `grade.changed`, `grade.released`, `grade.reopened` (entity
  `submission`).
- Reopening: the lecturer's Reopen grade (reason required). Before the learner's due date the learner
  may send the answer again; after it they cannot, and only the grade changes. To let a learner send
  again after the due date, give them an extension first (Submissions, Extension), then reopen.
- Counts on the Submissions page: Enrolled counts every enrolment except withdrawn ones (suspended and
  completed learners count); a learner is Missing only once their own due date (with any extension)
  has passed, "Not yet due" before. Enrolled always equals Submitted + Not yet due + Missing, and
  Submitted equals Graded + Ungraded. A withdrawn learner who had sent an answer is listed with a
  Withdrawn chip and not counted.
- Notifications: since Phase 9 a release writes a row in `public.notifications` (one per learner and
  event); the learner sees "New grade available" on their next page and the grade on the assignment
  page, which marks it read. Email and the notification centre arrive in Phase 11.

## Written in Phase 10

### Gradebooks, release of a whole course, exports and locked weights (D11 to D15, D30, ADR-015)

- Each course has its own gradebook: staff open it from the course (Gradebook tab) or from Gradebooks
  (lecturers) and Gradebook oversight (administrators); learners open Grades and feedback, then a course.
- "Review and release" on a course's Gradebook tab lists every draft grade of the course and releases
  them all at once. It is refused while the category weights do not total 100 (fix them on the
  Assignments tab first). Audit: `grades.released_course` (entity `course`), plus one `grade.released`
  per grade and one learner notification per grade.
- A learner's course grade says Provisional while any published assignment is still to come, ungraded
  or a draft; Final when none is; Not yet available when nothing counts yet. Ungraded work and work not
  yet due never count. Overdue work with nothing sent is Missing and does not count unless the setting
  `missing_as_zero` is true (D11; default false; until the Phase 11 settings screen, the owner changes
  it in the SQL editor: `update public.system_settings set value = 'true' where key = 'missing_as_zero';`).
  A late answer then lifts the zero, and its grade counts once released.
- Learners see a class chart only once the assignment has `min_class_size` (default 5) released
  results; staff always see it. The chart never shows names or ranks.
- Weights after the first release: lecturers see them locked. An administrator (signed in with two-step
  verification) opens the course's Assignments tab, Edit categories, gives a reason and presses Preview
  the effect before saving. Audit: `grade_categories.changed_after_release` with the reason and the
  categories and weights as saved (the previous weights are in the record before it). Renaming a category after release also needs the reason.
- Exports: Export on a gradebook (whole gradebook, or one assignment's report) or on Analytics (Export
  report). Excel files have DDTC's name, the course, the assignment and the export date at the top; CSV
  files have plain headings and a byte-order mark so Excel opens them with the right characters. Only
  the course's lecturers and administrators can export; learners cannot. Every export is recorded:
  `export.gradebook` or `export.assignment_report` (format and row count in the metadata). In the SQL
  editor: `select a.action, a.created_at, a.metadata, p.first_name || ' ' || p.second_name as by_whom
  from public.audit_logs a join public.profiles p on p.id = a.actor_id where a.action like 'export.%'
  order by a.created_at desc limit 50;`
- An administrator's look at a gradebook of a course they do not teach is recorded (`gradebook.viewed`).
- If an export fails with "The export could not be recorded", nothing was handed out: try again; if it
  persists, check the function logs for `export-gradebook` in the Supabase dashboard.
