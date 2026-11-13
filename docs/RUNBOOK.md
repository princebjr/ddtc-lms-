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

## Written in Phase 10.1

### Examinations, practical marks, the 40/30/30 course grade and branch groups (ADR-016)

- **Course grade parts:** every course has Weekly assignments 40%, Local Assembly practicals 30% and
  Final examinations 30%. Only an administrator (two-step verification) changes a course's split:
  Assignments tab, Parts of the course grade, Change weights, reason, Preview the effect, Save. Audit:
  `grade_categories.weights_changed` (or `grade_categories.changed_after_release`). A course that still has
  its own categories shows "Switch to the three parts" to administrators (audit
  `grade_categories.standard_parts_applied`). The migration switched every course with no released grade;
  to list the courses still waiting: `select c.title, c.course_code from public.courses c where not
  public.course_uses_standard_parts(c.id);`
- **Practicals:** create an assignment in "Local Assembly practicals"; learners cannot send an answer. Its
  Submissions page is the mark sheet: type the marks, Save marks, then Release marks. A changed released
  mark needs a reason. Marks are ordinary grades (history, audit `grade.saved`, `grade.released`).
- **Examinations:** the course's Examinations tab. The deadline is enforced by the database clock (UTC,
  shown in Ghana time); there is no timer. To give everyone more time: Change deadline (reopens one
  closed early). One learner: on their script, Authorise retake (reason and new deadline), or ask the
  developer to call `exam_extension_set`. Once anyone has started, the questions cannot change; fix a
  wrong question by archiving the examination and setting a new one. Multiple choice is marked on
  submission and is final. Release results releases only fully marked scripts. Audit actions all start
  with `exam.` (created, updated, questions_saved, published, unpublished, archived, restored,
  deadline_changed, closed, extension_set, extension_removed, started, submitted, marked, feedback_saved,
  released, retake_authorised); every mark, release and retake is also in `exam_grade_history`, which
  cannot be changed.
- **Learner support:** "The deadline for this examination has passed" means their deadline is over; saved
  answers are kept for the lecturer, who can mark them. An answer saved while offline stays on that
  device and is sent when it reconnects; if the device is lost before reconnecting, only what reached the
  server counts (the indicator says "All answers saved" once it has).
- **Exports:** Results, Export gives the examination's results (Excel or CSV), sorted by branch; audit
  `export.exam_results`. Every export is now sorted by branch, "No branch" last.

## Written in Phase 11

### Notifications, email and reminders (D21, D31, ADR-019)

- **Jobs:** `send-notification-email` every minute (`cron.job` `send-notification-email`, through the same Vault secrets as `cleanup-files`); `schedule-reminders` every 15 minutes (runs `private.schedule_reminders()` in the database; no secrets needed).
- **Email setup (once per environment):** create a Resend account and an API key, then set the function secrets (never in the repository or a `VITE_` variable):

```sh
npx supabase secrets set RESEND_API_KEY=<key> APP_URL=https://<app address> --project-ref <project-ref>
# Production only, after the DDTC domain is verified in Resend:
npx supabase secrets set EMAIL_FROM="DDTC LMS <noreply@<verified domain>>" --project-ref <project-ref>
```

  Without `RESEND_API_KEY` nothing is sent and emails stay queued. Without `EMAIL_FROM` the sender is Resend's test address, which only delivers to the Resend account owner's own address (staging, owner answer 5).
- **Retries:** a failed send waits 1, 5, 15, 60 and 240 minutes (`notification_retry_minutes`); the sixth failure is FAILED and every administrator gets an in-app alert ("An email could not be sent"). An invalid address fails at once. A wrong API key (401 or 403) stops the run without failing the emails; they are retried after 15 minutes.
- **Checks (SQL editor):**

```sql
select status, count(*) from public.notification_deliveries group by status;
select d.id, d.attempts, d.last_error, d.updated_at from public.notification_deliveries d where d.status = 'FAILED' order by d.updated_at desc limit 20;
select status, count(*) from public.notification_reminders group by status;
select jobname, schedule, active from cron.job;
```

- **Turning a person's email off:** they use the switch on their Notifications page; account emails (verification, password reset) are sent by Supabase Auth and are not affected.

### Announcements, reports, audit logs and settings (ADR-019)

- Announcements: lecturers to a course they teach; administrators to all learners, a course or a branch. They cannot be unsent; Archive hides one from learners and keeps it. Both are audited (`announcement.sent`, `announcement.archived`).
- Reports and the audit log need an administrator with two-step verification. Each CSV download is audited (`report.exported`, `audit_log.exported`).
- Settings refuse values outside their rules (for example a pass mark above 100 or a grade scale with a gap); each change is audited (`setting.updated`, old and new values).

## Written in Step 11.1

### Who's online (ADR-020)

- Presence uses Supabase Realtime on private channels; who may join is decided by the policies `presence_listen` and `presence_announce` on `realtime.messages` (migration 43). Nothing about presence is stored.
- **Realtime settings (Supabase dashboard, Project Settings, Realtime):** keep Realtime on, and turn **off** "Allow public access" so every channel must pass the policies. The app only uses private channels.
- If the card always says nobody is online: check that Realtime is on, that the person is an active learner or lecturer of a published course, and the browser console for a channel error (`CHANNEL_ERROR` usually means the policies refused, for example an administrator or a withdrawn learner).
- People drop off within about a minute of closing the app or losing their connection (the Realtime heartbeat).

## Written in Phase 12

### Learner-audio retention (D20, ADR-022)

**What it does.** Every day at 02:40 (Ghana time) the `retention-runner` job looks for learners' recorded or uploaded audio on submitted assignment and examination answers whose grade or result was released at least `retention_days` (180) days ago and is not held. Text, PDF and Word answers, lesson and instruction audio, attachments, grades, feedback and history are never touched. Administrators see each run on **Retention**.

**Launch state.** `retention_enabled` is false. Leave it off until the Phase 14 review. The job still runs daily as a dry run: it counts what it would remove and changes nothing.

**Enabling live deletion (after the Phase 14 review and DDTC's approval).**
1. Confirm on Retention that daily dry runs have been running for at least 30 days and that their counts look right.
2. Check the holds: anything under appeal, investigation or a learner's request is held (a course, a learner, or one answer from its answer or script page).
3. Switch **Live deletion** on and confirm. If 30 days of dry runs have not passed yet, nothing is deleted until they have; the database enforces this.
4. The next day, check the run on Retention: removed and failed counts. A failed deletion is retried every day. If the same files keep failing, read the run's details (`retention_runs.details`) and the Storage logs.

**Switching off.** Switch **Live deletion** off. The next run is a dry run again. Files already deleted cannot be recovered except from a Storage backup (D34).

**Changing the period.** `retention_days` changes only with DDTC's written approval. An AAL2 administrator updates it in the SQL editor:
`update public.system_settings set value = '<days>' where key = 'retention_days';`
The change is audited (`setting.updated`). The database accepts 0 to 3650. Never set 0 in production.

**Staging test (BUILD_PLAN Phase 14, item 14).** On staging only: set `retention_days` to 0, seed answers with released grades, run the job (`select private.call_edge_function('retention-runner');`), and check that only eligible learner audio is removed and that holds work. Then restore `retention_days` to 180 and `retention_enabled` to false, and verify both on Retention.

**After adding a new Edge Function locally.** The local stack lists its functions when it starts: run `npx supabase stop` and `npm run db:start` before testing a new function, or it answers 404 "Function not found".

## Written in Phase 13

### Backups (D34, ADR-023)

**Targets (D34, kept by DDTC on 2026-11-04 and 2026-11-12).** Lose at most 24 hours of work (RPO), be back within 8 hours (RTO), keep backups 30 days, rehearse a restore before launch and every quarter after.

**What runs.** The GitHub Actions workflow **Backup** (`.github/workflows/backup.yml`) runs every night at 01:30 Ghana time, and on demand from the Actions tab ("Run workflow"):
- **Database:** `pg_dump` of the whole database, encrypted with `age` to DDTC's public key, uploaded to the private Cloudflare R2 bucket as `db/db-<env>-<date>.dump.age`. Without the private key the file is unreadable.
- **Storage:** every file in the six buckets is copied to `storage/current/<bucket>`. A file changed or removed since the night before moves to `storage/history/<date>/<bucket>` instead of being lost.
- Each run is recorded through `backup_report` in `backup_runs` (and audited as `backup.succeeded` or `backup.failed`). The daily health check (06:15) alerts administrators when a backup failed, never ran, or the newest good one is older than 26 hours.
- Nothing is kept in GitHub (the repository is public). Until every secret below exists, the workflow only prints a warning, and the System health card shows the backups as missing.

**One-time setup (owner, about 30 minutes).**
1. **R2:** create a free Cloudflare account, then R2, then a bucket (for example `ddtc-lms-backups`). Leave public access off. Add two lifecycle rules: delete objects under `db/` after 30 days, and under `storage/history/` after 30 days.
2. **R2 key:** R2, then Manage API tokens, then create a token with *Object Read & Write* on that bucket only. Note the access key ID, the secret and the S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`).
3. **Encryption key:** on a trusted computer, install `age` and run `age-keygen -o ddtc-backup-key.txt`. The line `# public key: age1...` is the recipient. Keep `ddtc-backup-key.txt` **offline** in two places (for example an encrypted USB drive in the office safe and a password manager). If it is lost, the database backups cannot be read.
4. **Supabase Storage S3 key:** Supabase dashboard, then Project Settings, then Storage, then S3 Connection: enable it, note the endpoint, and create an access key.
5. **Database URL:** Project Settings, then Database, then Connection string (session pooler, port 5432), with the database password.
6. **GitHub secrets** (repository Settings, then Secrets and variables, then Actions): `BACKUP_DB_URL`, `AGE_PUBLIC_KEY` (the `age1…` public key), `BACKUP_SUPABASE_URL`, `BACKUP_SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_SUPABASE_S3_ENDPOINT`, `BACKUP_SUPABASE_S3_KEY_ID`, `BACKUP_SUPABASE_S3_SECRET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Add the variable `BACKUP_ENV` (`staging` now, `production` at launch). If the project is not in Europe (Ireland), also add the variable `BACKUP_SUPABASE_S3_REGION` with its region (shown on the S3 Connection page); the default is `eu-west-1`. The R2 endpoint is the account address only (`https://<account id>.r2.cloudflarestorage.com`, without the bucket name), and the R2 token needs Object Read & Write on the bucket.
7. Run the workflow by hand once. Check that the run is green, that both files appear in R2, and that the System health card on the administrator dashboard no longer lists the backups.

At launch, point the secrets at production. Production starts on the Supabase free plan (ADR-028), which keeps no backups of its own, so this nightly backup is the only copy: check the System health card daily. If DDTC later moves to Supabase Pro (about US$25 a month), Supabase's own daily backups become a second copy.

### Restore drill (D34; before launch, then every quarter)

Never restore over production or staging. Use a temporary project and delete it afterwards.

1. **Prepare.** Pause `ddtc-lms-dev` (the free plan allows two active projects), create a temporary project `ddtc-restore-<date>` in the same region, and note the start time.
2. **Schema and buckets.** From the repository: `npx supabase link --project-ref <temp ref>` then `npx supabase db push --linked --yes`. The migrations create the tables and the six buckets.
3. **Data.** Download the newest `db/*.dump.age` from R2, then run:
   - `age -d -i ddtc-backup-key.txt db-<env>-<date>.dump.age > restore.dump`
   - `pg_restore --data-only --schema=public --schema=auth --file=data.sql restore.dump`
   - `psql "<temp database URL>" -v ON_ERROR_STOP=1 -c "set session_replication_role = replica" -f data.sql`
4. **Files.** Enable the temporary project's S3 connection, add it to rclone as `temp`, and for each of the six buckets run `rclone copy r2:<R2 bucket>/storage/current/<bucket> temp:<bucket>`.
5. **Check.** Vault secrets never come back from a dump (Postgres refuses them, as it should). Set the scheduled jobs' secrets `project_url` and `service_role_key` in the temporary project's vault as for staging. Then run `psql "<temp database URL>" -f scripts/verify-restore.sql`. It passes when "VALIDATED files without a stored object" and "released scores outside their assignment marks" are both 0. Compare the table sizes with the source's, and note the newest records: the gap between them and the failure time is the data-loss window (must be under 24 hours).
6. **Journey.** Point a local build at the temporary project (`VITE_SUPABASE_URL` and the anon key in `.env.local`), sign in as an administrator, a lecturer and a learner, and open a course, a lesson's audio, a submitted answer and a gradebook.
7. **Record** in `docs/acceptance/` (or the quarterly log): the backup used, start and finish times (must be under 8 hours), the data-loss window, the check output and any problems. Then delete the temporary project, resume `ddtc-lms-dev`, and delete `restore.dump`, `data.sql` and every decrypted copy.

### Monitoring and the System health card (ADR-023)

There is no error-reporting service (owner decision, 2026-11-12). Problems are found in three places:
- **System health card** on the administrator dashboard, and a daily alert at 06:15 in every administrator's Notifications. It lists failed scheduled jobs or Edge Function calls in the last 24 hours, files that keep failing removal, failed emails, a retention job that has not run for 48 hours, and missing, failed or stale backups. Each issue is alerted once a day while it lasts.
- **Server logs:** Supabase dashboard, then Logs (Edge Functions, Postgres, Auth, Storage); and Vercel, then the project, then Logs. Learner data and secrets are never logged.
- **Uptime monitor (owner, free):** create a free account at an uptime service (for example UptimeRobot or Better Stack). Add an HTTPS check every 5 minutes on the production address and on `https://<project>.supabase.co/auth/v1/health`, and send alerts to the incident contact by email and SMS.

**What to do with an issue.** Read the card's message, then the matching log. A failed job: run it again from the SQL editor (`select private.call_edge_function('<job>');`). Failed emails: the Resend dashboard. A backup issue: the Backup workflow run on GitHub.

### Rate limits (ADR-023)

- **Sign-in, sign-up and token refresh:** Supabase Auth limits per IP, set in `supabase/config.toml` under `[remotes.staging.auth.rate_limit]` (150 sign-ins or sign-ups and 300 token refreshes per 5 minutes) and pushed with `npx supabase config push --project-ref <ref>`. There is no CAPTCHA (owner change to D22, 2026-11-05), so these limits are the protection.
- **Heavy actions** are limited per person in the Edge Functions (`supabase/functions/_shared/rate-limit.ts`): 30 gradebook exports per 10 minutes, 10 learner imports per hour, 120 upload starts per 10 minutes, 30 new accounts per hour, and 60 media removals per 10 minutes. Above a limit the person sees "Too many requests. Try again later." (HTTP 429). To change a limit, edit `LIMITS`, run the tests and deploy the function.
- Counts older than a day are removed daily (`private.rate_limit_clean`).

### Security headers

Set for every page by `vercel.json`: Content-Security-Policy (scripts only from the site itself plus the inline theme script by its hash; images, audio and connections only from the site and Supabase; no framing), HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy (microphone for the site itself only) and Cross-Origin-Opener-Policy. If the inline theme script in `index.html` changes, the unit test `security-headers.test.js` fails and shows the new hash to put in `vercel.json`. After a deploy, check with `curl -sI https://<site>`.

### Load and speed checks

See `docs/CAPACITY.md` for the load seed, the load test and the throttled-phone budgets.

## Written in Phase 15

### Help & Support contact (ADR-027)

Learners and lecturers find Help & Support on their dashboard and under More. Its Contact Support section shows the support email and the phone/WhatsApp number from Settings:
1. As an administrator with two-step verification, open **Settings**, then **Help & Support**.
2. Enter the **Support email** and the **Support phone and WhatsApp** number. Give the number with its country code, for example `+233 24 123 4567`, so the WhatsApp link works abroad too.
3. Save each one. The change is audited, and the Help page shows it within a minute.

Leave a field empty to hide it. With both empty, the page tells people to speak to their lecturer or a DDTC administrator. The database refuses a malformed email or a number that is not 7 to 15 digits.

The help text lives in `src/lib/help/content.js`, one set for learners and one for lecturers. When a screen's button or rule changes, change the text with it.

### Plan limits (ADR-028)

DDTC runs on the Supabase free plan, which allows 1 GB of stored files, a 500 MB database and 5 GB of downloads a month. The project pauses after 7 days without activity; the uptime monitor's checks keep it active.

- **Warnings:** the System health card and the daily alert warn when files or the database reach 80% of the limit, and raise an error at 95%, with what is used and what is left. The limits are on **Settings, Plan limits**; change them only when the plan changes.
- **Downloads (egress) cannot be measured from the app.** Once a month, open the Supabase dashboard, then the project, then **Usage**, and check "Egress". Lesson and answer audio are most of it.
- **When files near the limit:**
  1. Check that the cleanup job is removing replaced and unused files (System health shows if it is failing).
  2. Consider switching learner-audio retention on (runbook "Learner-audio retention") after DDTC's review.
  3. Ask lecturers to upload speech audio as MP3 or M4A at about 64 kbit/s mono rather than WAV.
  4. Otherwise decide on a paid plan (the growth plan in `docs/CAPACITY.md`).
- **When downloads near the limit:** the same audio advice applies; smaller audio files are the main saving.
