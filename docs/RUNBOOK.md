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
